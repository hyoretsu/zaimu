import { expect, test } from "bun:test";
import { createEventEnvelope } from "~/shared/application/events";
import type { queryRaw } from "~/shared/infra/sql";
import { HistoryLeaseLostError, runHistoryUnit } from "./history-collections";

const event = createEventEnvelope({
	aggregateId: "unit",
	aggregateType: "financialHistory",
	correlationId: "unit",
	eventType: "command.currency-rate-history-fetch",
	payload: { generation: 1, unitId: "unit" },
	userIds: [],
});
const unit = {
	attempts: 1,
	endDate: "2026-01-01",
	generation: 1,
	id: "unit",
	kind: "CURRENCY",
	leaseToken: "token",
	lockedUntil: new Date(),
	series: "USD",
	startDate: "2026-01-01",
	state: "RUNNING",
	updatedAt: "2026-01-01T00:00:00Z",
};

test("redelivery after completion or superseded generation performs no download", async () => {
	let downloads = 0;
	const execute = (async () => []) as typeof queryRaw;
	await runHistoryUnit(
		event,
		async () => {
			downloads++;
			return "COMPLETED";
		},
		execute,
	);
	expect(downloads).toBe(0);
});
test("expired worker is fenced before data may commit", async () => {
	const writes: string[] = [];
	const execute = (async (sql: string) => {
		writes.push(sql);
		return sql.includes('"attempts"="attempts"+1') ? [unit] : [];
	}) as unknown as typeof queryRaw;
	let persisted = false;
	await expect(
		runHistoryUnit(
			event,
			async (_unit, assertLease) => {
				await assertLease();
				persisted = true;
				return "COMPLETED";
			},
			execute,
		),
	).rejects.toBeInstanceOf(HistoryLeaseLostError);
	expect(persisted).toBe(false);
	expect(writes.at(-1)).toContain('AND "leaseToken"=$2');
});
test("transient download failure persists Retry-After and owner-fenced retry", async () => {
	const updates: unknown[][] = [];
	const execute = (async (sql: string, values: unknown[]) => {
		if (sql.includes('"attempts"="attempts"+1')) return [unit];
		updates.push(values);
		return [];
	}) as unknown as typeof queryRaw;
	const failure = Object.assign(new Error("provider throttled"), { retryAfterMs: 120_000 });
	await expect(
		runHistoryUnit(
			event,
			async () => {
				throw failure;
			},
			execute,
		),
	).rejects.toThrow("provider throttled");
	expect(updates[0]?.[2]).toBe("PENDING");
	expect(updates[0]?.[3]).toBeGreaterThanOrEqual(120_000);
	expect(updates[0]?.[1]).toBeString();
});
test("fifth provider failure becomes resumable failure and signals DLQ", async () => {
	const updates: unknown[][] = [];
	const execute = (async (sql: string, values: unknown[]) => {
		if (sql.includes('"attempts"="attempts"+1')) return [{ ...unit, attempts: 5 }];
		updates.push(values);
		return [];
	}) as unknown as typeof queryRaw;
	const failure = new Error("unavailable") as Error & { historyExhausted?: boolean };
	await expect(
		runHistoryUnit(
			event,
			async () => {
				throw failure;
			},
			execute,
		),
	).rejects.toThrow("unavailable");
	expect(updates[0]?.[2]).toBe("FAILED");
	expect(failure.historyExhausted).toBe(true);
});
