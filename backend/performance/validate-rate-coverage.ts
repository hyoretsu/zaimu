// biome-ignore-all lint/suspicious/noMisplacedAssertion: Standalone database validator uses Node assertions.
import assert from "node:assert/strict";
import { referenceRateAveragesSql } from "../src/modules/reference-rates/domain/reference-rate-averages-sql";

const url = new URL(process.env.PERFORMANCE_DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55495" || url.pathname !== "/zaimu_performance")
	throw new Error("Dedicated performance database required");
process.env.DATABASE_URL = url.href;
const { withRawTransaction, closeDatabase } = await import("sql");
const rollback = new Error("rollback coverage validation");
const evidence: unknown[] = [];
try {
	await withRawTransaction(async query => {
		const baseline = referenceRateAveragesSql.replace("coverage AS MATERIALIZED (", "coverage AS (");
		const window = ["2016-10-04", "2026-10-03"];
		for (const phase of ["complete", "gap"]) {
			if (phase === "gap")
				await query(
					`DELETE FROM "OutboxEvent" WHERE "eventType"='referenceRate.historyFetched' AND "payload"->>'referenceType'='SELIC'`,
				);
			const expected = await query(baseline, ["2026-10-01", "2026-10-03"]);
			const actual = await query(referenceRateAveragesSql, ["2026-10-01", "2026-10-03"]);
			const order = (rows: typeof actual) =>
				rows.toSorted((a, b) => String(a.type).localeCompare(String(b.type)));
			assert.deepEqual(order(actual), order(expected));
			const start = performance.now();
			const full = await query<{ type: string; ready: boolean; average: number }>(
				referenceRateAveragesSql,
				window,
			);
			assert.equal(full.find(row => row.type === "CDI")?.ready, true);
			assert.equal(full.find(row => row.type === "SELIC")?.ready, phase === "complete");
			for (const row of full) assert.equal(Number(row.average), 0.04);
			evidence.push({
				completeWindowCorrect: true,
				durationMs: performance.now() - start,
				equivalentShortWindow: true,
				phase,
			});
			if (phase === "complete") {
				const plans = await query(
					`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${referenceRateAveragesSql}`,
					window,
				);
				evidence.push({ plans });
			}
		}
		throw rollback;
	});
} catch (error) {
	if (error !== rollback) throw error;
} finally {
	await closeDatabase();
}
await Bun.write(
	process.env.PERFORMANCE_REPORT_PATH ?? new URL("./rate-coverage-0018.json", import.meta.url),
	JSON.stringify({ evidence, passed: true, rolledBack: true }, null, 2),
);
console.info(JSON.stringify(evidence.filter(row => !(row as { plans?: unknown }).plans)));
