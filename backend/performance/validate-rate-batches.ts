// biome-ignore-all lint/suspicious/noMisplacedAssertion: Standalone database validator uses Node assertions.
import assert from "node:assert/strict";
import {
	referenceRateBatchInsertSql,
	referenceRateInsertSql,
} from "../src/modules/reference-rates/domain/reference-rate-insert-sql";

const url = new URL(process.env.PERFORMANCE_DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55495" || url.pathname !== "/zaimu_performance")
	throw new Error("Dedicated performance database required");
process.env.DATABASE_URL = url.href;
const { withRawTransaction, closeDatabase } = await import("sql");
const rollback = new Error("rollback rate validation");
try {
	await withRawTransaction(async query => {
		const values = [
			{ date: "2099-01-02", value: 0.01 },
			{ date: "2099-01-03", value: 0.02 },
			{ date: "2099-01-02", value: 0.03 },
		];
		for (const preserve of [true, false]) {
			await query(`DELETE FROM "ReferenceRate" WHERE "date" BETWEEN '2099-01-02' AND '2099-01-03'`);
			for (const rate of values)
				await query(referenceRateInsertSql(preserve), ["CDI", rate.date, rate.value]);
			const expected = await query(
				`SELECT "date"::text,"value"::text FROM "ReferenceRate" WHERE "type"='CDI' AND "date" BETWEEN '2099-01-02' AND '2099-01-03' ORDER BY "date"`,
			);
			await query(`DELETE FROM "ReferenceRate" WHERE "date" BETWEEN '2099-01-02' AND '2099-01-03'`);
			assert.equal(
				(await query(referenceRateBatchInsertSql(preserve), ["CDI", JSON.stringify(values)])).length,
				2,
			);
			const actual = await query(
				`SELECT "date"::text,"value"::text FROM "ReferenceRate" WHERE "type"='CDI' AND "date" BETWEEN '2099-01-02' AND '2099-01-03' ORDER BY "date"`,
			);
			assert.deepEqual(actual, expected);
			await query(
				`UPDATE "ReferenceRate" SET "updatedAt"='2098-01-01' WHERE "date" BETWEEN '2099-01-02' AND '2099-01-03'`,
			);
			assert.equal(
				(await query(referenceRateBatchInsertSql(preserve), ["CDI", JSON.stringify(values)])).length,
				0,
			);
			const timestamps = await query<{ unchanged: boolean }>(
				`SELECT bool_and("updatedAt"='2098-01-01'::timestamp) AS unchanged FROM "ReferenceRate" WHERE "date" BETWEEN '2099-01-02' AND '2099-01-03'`,
			);
			assert.equal(timestamps[0]?.unchanged, true);
		}
		throw rollback;
	});
} catch (error) {
	if (error !== rollback) throw error;
} finally {
	await closeDatabase();
}
console.info(
	JSON.stringify({
		correction: true,
		duplicateDates: true,
		passed: true,
		preserveExisting: true,
		rolledBack: true,
		unchangedTimestamps: true,
	}),
);
