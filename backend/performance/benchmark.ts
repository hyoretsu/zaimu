import { performanceBudgets } from "./budgets";

const baseUrlValue = process.env.PERFORMANCE_BASE_URL ?? "http://127.0.0.1:3333";
const baseUrl = new URL(baseUrlValue);
if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname))
	throw new Error("O benchmark aceita somente API local");

const cookie = process.env.PERFORMANCE_COOKIE;
if (!cookie) throw new Error("Defina PERFORMANCE_COOKIE com a sessão do usuário performance-user");

const iterations = Number(process.env.PERFORMANCE_ITERATIONS ?? 25);
if (!Number.isInteger(iterations) || iterations < 5) throw new Error("PERFORMANCE_ITERATIONS deve ser >= 5");

interface Sample {
	durationMs: number;
	queryCount: number | null;
	sqlDurationMs: number | null;
}

const request = async (path: string): Promise<Sample> => {
	const startedAt = performance.now();
	const response = await fetch(new URL(path, baseUrl), { headers: { cookie } });
	const durationMs = performance.now() - startedAt;
	if (!response.ok) throw new Error(`${path} retornou HTTP ${response.status}: ${await response.text()}`);
	await response.arrayBuffer();
	const queryCount = response.headers.get("x-performance-query-count");
	const sqlDurationMs = response.headers.get("x-performance-sql-duration-ms");
	return {
		durationMs,
		queryCount: queryCount === null ? null : Number(queryCount),
		sqlDurationMs: sqlDurationMs === null ? null : Number(sqlDurationMs),
	};
};

const percentile95 = (values: number[]) =>
	values.toSorted((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];

const results: Record<string, unknown> = {};
let failed = false;
for (const [name, budget] of Object.entries(performanceBudgets)) {
	const cold = await request(budget.path);
	for (let warmup = 0; warmup < 3; warmup++) await request(budget.path);
	const hot = await Promise.all(Array.from({ length: iterations }, () => request(budget.path)));
	const hotP95Ms = percentile95(hot.map(sample => sample.durationMs));
	const hotQueryCount = Math.max(...hot.map(sample => sample.queryCount ?? Number.POSITIVE_INFINITY));
	const passed =
		cold.durationMs < budget.coldP95Ms && hotP95Ms < budget.hotP95Ms && hotQueryCount <= budget.hotQueryCount;
	failed ||= !passed;
	results[name] = {
		budget,
		cold: {
			durationMs: Number(cold.durationMs.toFixed(2)),
			queryCount: cold.queryCount,
			sqlDurationMs: cold.sqlDurationMs,
		},
		hot: {
			p95Ms: Number(hotP95Ms.toFixed(2)),
			queryCount: Number.isFinite(hotQueryCount) ? hotQueryCount : null,
		},
		passed,
	};
}

const report = {
	generatedAt: new Date().toISOString(),
	iterations,
	results,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--write"))
	await Bun.write(new URL("./baseline.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
if (failed) process.exitCode = 1;
