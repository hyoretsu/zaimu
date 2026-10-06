// biome-ignore-all lint/suspicious/noMisplacedAssertion: Standalone integration validator uses Node assertions outside Bun test discovery.
import assert from "node:assert/strict";
import { installmentOccurrenceDate } from "@zaimu/finance/credit-purchase";

const url = new URL(process.env.PERFORMANCE_DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55495" || url.pathname !== "/zaimu_performance")
	throw new Error("Dedicated performance database required");
process.env.DATABASE_URL = url.toString();
const { closeDatabase, withRawTransaction } = await import("sql");
const { materializeCreditCardSchedules } = await import(
	"../src/modules/creditCards/application/materialize-credit-card-schedules"
);
const { materializeAllRecurrences } = await import("../src/modules/recurring/application/recurrences");
const { loadCreditCardScheduleCandidates } = await import(
	"../src/modules/creditCards/application/credit-card-schedule-candidates"
);
const rollback = new Error("rollback schedule validation");
const cutoff = new Date("2026-10-04T12:00:00Z");
let comparisons = 0;
try {
	await withRawTransaction(async query => {
		const dates = await query<{ original: string; number: number; occurrence: string }>(
			`SELECT d::text AS original,n AS number,(d+make_interval(months=>n-1))::date::text AS occurrence FROM unnest(ARRAY['2024-01-31','2025-01-31','2024-02-29','2025-12-31']::date[]) d CROSS JOIN generate_series(1,36) n`,
		);
		for (const row of dates) {
			assert.equal(row.occurrence, installmentOccurrenceDate(row.original, row.number));
			comparisons++;
		}
		const candidates = await loadCreditCardScheduleCandidates(cutoff);
		assert.ok(candidates.length > 0, "Fixture must exercise missing schedules");
		const first = await materializeCreditCardSchedules(cutoff);
		assert.ok(first.userIds.includes("performance-user"));
		const second = await materializeCreditCardSchedules(cutoff);
		assert.deepEqual(second.userIds, [], "Duplicate materialization must report no changes");
		const empty = await materializeCreditCardSchedules(cutoff, []);
		assert.equal(empty.cards, 0);
		const recurrence = await materializeAllRecurrences(cutoff, []);
		assert.equal(recurrence.transactions, 0);
		throw rollback;
	});
} catch (error) {
	if (error !== rollback) throw error;
} finally {
	await closeDatabase();
}
console.info(
	JSON.stringify({
		calendarComparisons: comparisons,
		duplicateMaterialization: true,
		passed: true,
		rolledBack: true,
	}),
);
