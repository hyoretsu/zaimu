import { expect, test } from "bun:test";
import { getQueryMetrics, startQuery } from "sql";
import { instrumentJob } from "./job-metrics";

test("isolates concurrent jobs and freezes metrics before later work", async () => {
	const records: Record<string, unknown>[] = [];
	let late: Promise<void> | undefined;
	await Promise.all([
		instrumentJob(
			"first",
			Date.now() - 100,
			async () => {
				startQuery()();
				late = Bun.sleep(20).then(() => startQuery()());
				await Bun.sleep(1);
			},
			record => records.push(record),
		),
		instrumentJob(
			"second",
			undefined,
			async () => {
				startQuery()();
				startQuery()();
			},
			record => records.push(record),
		),
	]);
	await late;
	expect(records.find(record => record.queue === "first")?.queryCount).toBe(1);
	expect(records.find(record => record.queue === "second")?.queryCount).toBe(2);
	expect(records.find(record => record.queue === "first")?.queueLagMs).toBeGreaterThanOrEqual(100);
	expect(records.find(record => record.queue === "second")?.queueLagMs).toBeNull();
	expect(getQueryMetrics()).toBeUndefined();
});

test("records infrastructure failures and rethrows original error", async () => {
	const records: Record<string, unknown>[] = [];
	const failure = new Error("sensitive payload must not be logged");
	await expect(
		instrumentJob(
			"failed",
			undefined,
			async () => {
				throw failure;
			},
			record => records.push(record),
		),
	).rejects.toBe(failure);
	expect(records[0]?.outcome).toBe("error");
	expect(JSON.stringify(records)).not.toContain(failure.message);
});
