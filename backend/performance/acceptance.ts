import { cpus, freemem, loadavg, totalmem } from "node:os";
import { RedisClient } from "bun";
import { performanceBudgets } from "./budgets";
import { completeCoverage, evaluateCoverage } from "./coverage";
import coverage from "./coverage.json";
import { mutationScenarios, runMutationScenario } from "./mutations";
import { preflight } from "./preflight";
import { captureRequest, completeMetrics, percentile, type RequestSample, selectScenarios } from "./runner";
import { attachTelemetry, completeTelemetry, readTelemetry } from "./telemetry";

const base = new URL(process.env.PERFORMANCE_BASE_URL ?? "http://127.0.0.1:3335");
const redisUrl = new URL(process.env.PERFORMANCE_ISOLATED_REDIS_URL ?? "redis://127.0.0.1:6395");
if (
	base.hostname !== "127.0.0.1" ||
	base.port !== "3335" ||
	redisUrl.hostname !== "127.0.0.1" ||
	redisUrl.port !== "6395"
)
	throw new Error("Dedicated loopback API 3335 and Redis 6395 required");
const namespace = "zaimu_performance";
const hostStart = { freeMemoryBytes: freemem(), loadAverage: loadavg() };
const diagnostic = process.argv.includes("--diagnostic");
const iterations = diagnostic ? 5 : 25;
const rounds = diagnostic ? 1 : 3;
const loads = diagnostic ? [1] : [1, 5, 20];
const selected = selectScenarios(
	[...Object.keys(performanceBudgets), ...mutationScenarios],
	process.env.PERFORMANCE_SCENARIOS,
);
const redis = new RedisClient(redisUrl.href);
type Sample = RequestSample;
const cookies: string[] = [];
const results: Record<string, unknown> = {};
const summaries: {
	name: string;
	round: number;
	load: number;
	mode: string;
	passed: boolean;
	p95Ms: number;
	maxQueries: number | null;
}[] = [];
let failed = false;
let fixture: Awaited<ReturnType<typeof preflight>> | undefined;
const request = async (path: string, user: number, init: RequestInit = {}): Promise<Sample> => {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookies[user]!);
	return (
		await captureRequest(new URL(path.replaceAll("perf-", user === 0 ? "perf-" : `p${user}-`), base), {
			...init,
			headers,
		})
	).sample;
};
const clearDataCache = async () => {
	let cursor = "0";
	do {
		const [next, keys] = (await redis.send("SCAN", [
			cursor,
			"MATCH",
			`${namespace}:v2:*`,
			"COUNT",
			"1000",
		])) as [string, string[]];
		if (keys.length) await redis.send("UNLINK", keys);
		cursor = next;
	} while (cursor !== "0");
};
try {
	fixture = await preflight(Math.max(...loads));
	for (let user = 0; user < Math.max(...loads); user++) {
		const response = await fetch(new URL("/api/auth/sign-in/email", base), {
			body: JSON.stringify({ email: `performance${user}@zaimu.local`, password: "Performance-local-2026" }),
			headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(60000),
		});
		await response.arrayBuffer();
		if (response.headers.get("x-performance-namespace") !== namespace)
			throw new Error("API is not the dedicated performance environment");
		if (!response.ok) throw new Error(`Fixture login failed: HTTP ${response.status}`);
		cookies.push(
			response.headers
				.getSetCookie()
				.map(cookie => cookie.split(";")[0])
				.join("; "),
		);
	}
	for (const [name, budget] of Object.entries(performanceBudgets)) {
		if (!selected.includes(name)) continue;
		for (let round = 1; round <= rounds; round++)
			for (const load of loads) {
				for (const mode of ["redis-cold", "hot", "304"] as const) {
					const samples: Sample[] = [];
					const etags: (string | null)[] = [];
					if (mode !== "redis-cold") {
						for (let user = 0; user < load; user++) {
							await request(budget.path, user);
							const warm = await fetch(
								new URL(budget.path.replaceAll("perf-", user === 0 ? "perf-" : `p${user}-`), base),
								{
									headers: { cookie: cookies[user]! },
									redirect: "error",
									signal: AbortSignal.timeout(60000),
								},
							);
							await warm.arrayBuffer();
							etags.push(warm.headers.get("etag"));
						}
					}
					const startedAt = performance.now();
					// Fixed concurrent users, each user completes before its next iteration.
					for (let wave = 0; wave < Math.ceil(iterations / load); wave++) {
						if (mode === "redis-cold") await clearDataCache();
						const waveSamples = await Promise.all(
							Array.from({ length: load }, (_, user) =>
								request(
									budget.path,
									user,
									mode === "304" && etags[user] ? { headers: { "if-none-match": etags[user]! } } : {},
								),
							),
						);
						samples.push(...waveSamples);
					}
					const values = samples.map(sample => sample.durationMs).toSorted((a, b) => a - b);
					const p95Ms = values[Math.ceil(values.length * 0.95) - 1]!;
					const maxQueries = samples.every(sample => sample.queries !== null)
						? Math.max(...samples.map(sample => sample.queries!))
						: null;
					const passed =
						samples.every(
							sample =>
								completeMetrics(sample) &&
								sample.status === (mode === "304" ? 304 : 200) &&
								sample.queries !== null &&
								sample.businessQueries !== null &&
								sample.authQueries !== null &&
								sample.sqlDurationMs !== null &&
								sample.requestId !== null &&
								sample.cache === (mode === "redis-cold" ? "MISS" : "HIT") &&
								(mode === "redis-cold"
									? sample.businessQueries <= budget.coldQueryCount
									: sample.queries === 0),
						) && p95Ms < (mode === "redis-cold" ? budget.coldP95Ms : budget.hotP95Ms);
					const key = `${name}:${round}:${load}:${mode}`;
					summaries.push({ load, maxQueries, mode, name, p95Ms, passed, round });
					results[key] = {
						p50Ms: percentile(values, 0.5),
						p95Ms,
						p99Ms: values[Math.ceil(values.length * 0.99) - 1],
						passed,
						samples,
						throughput: samples.length / ((performance.now() - startedAt) / 1000),
					};
					failed ||= !passed;
					console.info(JSON.stringify({ load, maxQueries, mode, name, p95Ms, passed, round }));
				}
			}
	}
	for (const name of selected.filter(name => mutationScenarios.includes(name))) {
		for (let round = 1; round <= rounds; round++)
			for (const load of loads) {
				const result = await runMutationScenario(name, { base, cookies, iterations, load });
				results[`${name}:${round}:${load}:mutation`] = result;
				failed ||= !result.passed;
				console.info(JSON.stringify({ load, name, p95Ms: result.p95Ms, passed: result.passed, round }));
			}
	}
} catch (error) {
	failed = true;
	results.runner = { error: error instanceof Error ? error.message : "runner-error", passed: false };
} finally {
	redis.close();
	const telemetry = await readTelemetry(process.env.PERFORMANCE_API_LOG);
	for (const value of Object.values(results)) {
		const result = value as { samples?: Sample[]; passed?: boolean };
		if (result.samples) {
			result.samples = result.samples.map(sample => attachTelemetry(sample, telemetry));
			if (
				!diagnostic &&
				result.samples.some(
					sample => !sample.requestId || !completeTelemetry(telemetry.get(sample.requestId)),
				)
			) {
				result.passed = false;
				failed = true;
			}
		}
	}
	const measuredCoverage = evaluateCoverage(coverage, results);
	const report = {
		configuration: {
			fixture,
			iterations,
			loads,
			machine: {
				bun: Bun.version,
				cpu: cpus()[0]?.model,
				cpus: cpus().length,
				hostEnd: { freeMemoryBytes: freemem(), loadAverage: loadavg() },
				hostStart,
				memoryBytes: totalmem(),
			},
			namespace,
			rounds,
		},
		coverage: measuredCoverage,
		diagnostic,
		generatedAt: new Date().toISOString(),
		passed: !failed && !diagnostic && completeCoverage(measuredCoverage),
		readScenariosPassed:
			!failed && !diagnostic && Object.keys(performanceBudgets).every(name => selected.includes(name)),
		referenceDate: "2026-10-04",
		results,
		selected,
		selectedScenariosPassed: !failed && !diagnostic,
		summaries,
		worker: process.env.PERFORMANCE_WORKER_STATE ?? "stopped",
	};
	if (!diagnostic && !report.passed) process.exitCode = 1;
	await Bun.write(
		process.env.PERFORMANCE_REPORT_PATH ?? new URL("./acceptance-result.json", import.meta.url),
		`${JSON.stringify(report, null, 2)}\n`,
	);
}
if (failed) process.exitCode = 1;
