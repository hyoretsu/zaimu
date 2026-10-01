import { RedisClient } from "bun";
import { performanceBudgets } from "./budgets";
import { measureRequest } from "./sample";

const baseUrlValue = process.env.PERFORMANCE_BASE_URL ?? "http://127.0.0.1:3333";
const baseUrl = new URL(baseUrlValue);
if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname))
	throw new Error("O benchmark aceita somente API local");

const cookie = process.env.PERFORMANCE_COOKIE;
if (!cookie) throw new Error("Defina PERFORMANCE_COOKIE com a sessão do usuário performance-user");

const iterations = Number(process.env.PERFORMANCE_ITERATIONS ?? 25);
if (!Number.isInteger(iterations) || iterations < 5) throw new Error("PERFORMANCE_ITERATIONS deve ser >= 5");

const request = (path: string) => measureRequest(new URL(path, baseUrl), cookie);

const percentile95 = (values: number[]) =>
	values.toSorted((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];

const coldRedisUrl = process.env.PERFORMANCE_ISOLATED_REDIS_URL;
if (!coldRedisUrl)
	throw new Error(
		"Defina PERFORMANCE_ISOLATED_REDIS_URL para Redis local dedicado; cada amostra fria limpa esse banco",
	);
const redisUrl = new URL(coldRedisUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(redisUrl.hostname) || redisUrl.port !== "6395")
	throw new Error("A captura fria aceita somente Redis local isolado na porta 6395");
const redis = new RedisClient(coldRedisUrl);
const results: Record<string, unknown> = {};
let failed = false;
for (const [name, budget] of Object.entries(performanceBudgets)) {
	try {
		const coldSamples = [];
		for (let sample = 0; sample < iterations; sample++) {
			await redis.send("FLUSHDB", []);
			coldSamples.push(await request(budget.path));
		}
		const coldP95Ms = percentile95(coldSamples.map(sample => sample.durationMs));
		const coldQueryCount = Math.max(
			...coldSamples.map(sample => sample.queryCount ?? Number.POSITIVE_INFINITY),
		);
		for (let warmup = 0; warmup < 3; warmup++) await request(budget.path);
		const hot = await Promise.all(Array.from({ length: iterations }, () => request(budget.path)));
		const hotP95Ms = percentile95(hot.map(sample => sample.durationMs));
		const hotQueryCount = Math.max(...hot.map(sample => sample.queryCount ?? Number.POSITIVE_INFINITY));
		const passed =
			coldP95Ms < budget.coldP95Ms &&
			coldQueryCount <= budget.coldQueryCount &&
			hotP95Ms < budget.hotP95Ms &&
			hotQueryCount <= budget.hotQueryCount;
		failed ||= !passed;
		results[name] = {
			budget,
			cold: {
				p95Ms: Number(coldP95Ms.toFixed(2)),
				queryCount: Number.isFinite(coldQueryCount) ? coldQueryCount : null,
			},
			hot: {
				p95Ms: Number(hotP95Ms.toFixed(2)),
				queryCount: Number.isFinite(hotQueryCount) ? hotQueryCount : null,
			},
			passed,
		};
	} catch (error) {
		failed = true;
		results[name] = { budget, error: error instanceof Error ? error.message : String(error), passed: false };
	}
}
redis.close();

const report = {
	generatedAt: new Date().toISOString(),
	iterations,
	results,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--write"))
	await Bun.write(new URL("./baseline.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
if (failed) process.exitCode = 1;
