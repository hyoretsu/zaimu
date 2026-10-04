import { cpus, totalmem } from "node:os";
import { RedisClient } from "bun";
import { performanceBudgets } from "./budgets";
import coverage from "./coverage.json";

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
const diagnostic = process.argv.includes("--diagnostic");
const iterations = diagnostic ? 5 : 25;
const rounds = diagnostic ? 1 : 3;
const loads = diagnostic ? [1] : [1, 5, 20];
const selected = process.env.PERFORMANCE_SCENARIOS?.split(",");
const redis = new RedisClient(redisUrl.href);
interface Sample {
	durationMs: number;
	status: number;
	bytes: number;
	queries: number | null;
	businessQueries: number | null;
	authQueries: number | null;
	sqlDurationMs: number | null;
	sqlElapsedMs: number | null;
	connectionWaitMs: number | null;
	cache: string | null;
	requestId: string | null;
	error?: string;
}
const headerNumber = (response: Response, name: string) => {
	const value = response.headers.get(name);
	if (value === null || value.trim() === "" || !Number.isFinite(Number(value))) return null;
	return Number(value);
};
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
const request = async (path: string, user: number, init: RequestInit = {}): Promise<Sample> => {
	const start = performance.now();
	try {
		const headers = new Headers(init.headers);
		headers.set("cookie", cookies[user]!);
		const response = await fetch(
			new URL(path.replaceAll("perf-", user === 0 ? "perf-" : `p${user}-`), base),
			{ ...init, headers, redirect: "error", signal: AbortSignal.timeout(60000) },
		);
		const body = await response.arrayBuffer();
		return {
			authQueries: headerNumber(response, "x-performance-auth-query-count"),
			businessQueries: headerNumber(response, "x-performance-business-query-count"),
			bytes: body.byteLength,
			cache: response.headers.get("x-cache"),
			connectionWaitMs: headerNumber(response, "x-performance-connection-wait-ms"),
			durationMs: performance.now() - start,
			queries: headerNumber(response, "x-performance-query-count"),
			requestId: response.headers.get("x-performance-request-id"),
			sqlDurationMs: headerNumber(response, "x-performance-sql-duration-ms"),
			sqlElapsedMs: headerNumber(response, "x-performance-sql-elapsed-ms"),
			status: response.status,
		};
	} catch (error) {
		return {
			authQueries: null,
			businessQueries: null,
			bytes: 0,
			cache: null,
			connectionWaitMs: null,
			durationMs: performance.now() - start,
			error: error instanceof Error ? error.name : "request-error",
			queries: null,
			requestId: null,
			sqlDurationMs: null,
			sqlElapsedMs: null,
			status: 0,
		};
	}
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
	for (let user = 0; user < Math.max(...loads); user++) {
		const response = await fetch(new URL("/api/auth/sign-in/email", base), {
			body: JSON.stringify({ email: `performance${user}@zaimu.local`, password: "Performance-local-2026" }),
			headers: { "content-type": "application/json", origin: "http://localhost:5173" },
			method: "POST",
			signal: AbortSignal.timeout(60000),
		});
		await response.arrayBuffer();
		if (!response.ok) throw new Error(`Fixture login failed: HTTP ${response.status}`);
		cookies.push(
			response.headers
				.getSetCookie()
				.map(cookie => cookie.split(";")[0])
				.join("; "),
		);
	}
	for (const [name, budget] of Object.entries(performanceBudgets)) {
		if (selected && !selected.includes(name)) continue;
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
								{ headers: { cookie: cookies[user]! }, signal: AbortSignal.timeout(60000) },
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
						p50Ms: values[Math.floor(values.length / 2)],
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
} catch (error) {
	failed = true;
	results.runner = { error: error instanceof Error ? error.message : "runner-error", passed: false };
} finally {
	redis.close();
	const report = {
		configuration: {
			iterations,
			loads,
			machine: { bun: Bun.version, cpu: cpus()[0]?.model, cpus: cpus().length, memoryBytes: totalmem() },
			namespace,
			rounds,
		},
		coverage,
		diagnostic,
		generatedAt: new Date().toISOString(),
		passed: false,
		readScenariosPassed: !failed && !diagnostic,
		referenceDate: "2026-10-04",
		results,
		summaries,
		worker: process.env.PERFORMANCE_WORKER_STATE ?? "stopped",
	};
	await Bun.write(
		process.env.PERFORMANCE_REPORT_PATH ?? new URL("./acceptance-result.json", import.meta.url),
		`${JSON.stringify(report, null, 2)}\n`,
	);
}
if (failed) process.exitCode = 1;
