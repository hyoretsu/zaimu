import { expect, test } from "bun:test";
import { createEventEnvelope } from "~/shared/application/events";
import type { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { HistoryLeaseLostError, requestHistoryCollection, runHistoryUnit } from "./history-collections";

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

test("coverage completion schedules only the exact selected currency range", async () => {
	const calls: { statement: string; parameters: unknown[] }[] = [];
	const query = (async (statement: string, parameters: unknown[] = []) => {
		calls.push({ parameters, statement });
		return statement.includes('INSERT INTO "FinancialHistoryCollection"') ? [{ id: "collection" }] : [];
	}) as typeof queryRaw;
	const transaction: typeof withRawTransaction = async operation => operation(query);
	await requestHistoryCollection(
		"CURRENCY",
		["BRL"],
		undefined,
		{
			publish: async () => {},
			publishBatch: async () => {},
			read: async () => null,
			transaction,
		},
		{ endDate: "2025-12-10", startDate: "2025-12-10" },
	);
	expect(calls.find(call => call.statement.includes("generate_series"))?.parameters).toEqual([
		"BRL",
		"2025-12-10",
		"2025-12-10",
	]);
	expect(calls[0]?.parameters.slice(3, 5)).toEqual(["2025-12-10", "2025-12-10"]);
});

test("coverage completion rejects reversed and future windows before database access", async () => {
	for (const window of [
		{ endDate: "2025-12-10", startDate: "2025-12-11" },
		{ endDate: "2999-01-02", startDate: "2999-01-01" },
	]) {
		await expect(
			requestHistoryCollection("CURRENCY", ["BRL"], undefined, undefined, window),
		).rejects.toThrow();
	}
});

test("multi-decade interest collection publishes bounded annual jobs without gaps", async () => {
	const published: { startDate: string; endDate: string }[] = [];
	const query = (async (statement: string, parameters: unknown[] = []) => {
		if (statement.includes('INSERT INTO "FinancialHistoryCollection"')) return [{ id: "collection" }];
		if (statement.includes('INSERT INTO "FinancialHistoryUnit"'))
			return [
				{
					...unit,
					attempts: 0,
					endDate: parameters[5],
					generation: 0,
					id: String(parameters[0]),
					kind: "INTEREST",
					series: "CDI",
					startDate: parameters[4],
					state: "PENDING",
				},
			];
		return [];
	}) as typeof queryRaw;
	await requestHistoryCollection(
		"INTEREST",
		["CDI"],
		undefined,
		{
			publish: async job => {
				published.push(job);
			},
			read: async () => null,
			transaction: async operation => operation(query),
		},
		{ endDate: "2025-03-10", startDate: "2000-06-15" },
	);
	expect(published).toHaveLength(26);
	expect(published[0]).toMatchObject({ endDate: "2000-12-31", startDate: "2000-06-15" });
	expect(published.at(-1)).toMatchObject({ endDate: "2025-03-10", startDate: "2025-01-01" });
	for (let index = 0; index < published.length; index++) {
		const job = published[index]!;
		expect(Date.parse(job.endDate) - Date.parse(job.startDate)).toBeLessThanOrEqual(365 * 86400000);
		if (index > 0)
			expect(Date.parse(job.startDate) - Date.parse(published[index - 1]!.endDate)).toBe(86400000);
	}
});
