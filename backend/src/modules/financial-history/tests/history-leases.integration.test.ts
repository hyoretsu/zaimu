import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { createEventEnvelope } from "~/shared/application/events";
import type { queryRaw } from "~/shared/infra/sql";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { runHistoryUnit } from "../application/history-collections";

const url = requireFixtureUrl("HISTORY_SQL_TEST_URL");
describe("local PostgreSQL history fencing", () => {
	const schema = `history_test_${crypto.randomUUID().replaceAll("-", "")}`;
	let first: Client;
	let second: Client;
	const event = createEventEnvelope({
		aggregateId: "unit",
		aggregateType: "financialHistory",
		correlationId: "unit",
		eventType: "command.currency-rate-history-fetch",
		payload: { generation: 1, unitId: "unit" },
		userIds: [],
	});
	const execute = (client: Client) =>
		(async (sql: string, values?: unknown[]) => (await client.query(sql, values)).rows) as typeof queryRaw;
	beforeAll(async () => {
		first = new Client({ connectionString: url });
		second = new Client({ connectionString: url });
		await first.connect();
		await second.connect();
		await first.query(`CREATE SCHEMA "${schema}"`);
		for (const client of [first, second]) await client.query(`SET search_path TO "${schema}"`);
		await first.query(`CREATE TABLE "FinancialHistoryUnit" (
   "id" text PRIMARY KEY, "kind" text, "series" text, "startDate" date, "endDate" date,
   "state" text, "attempts" integer DEFAULT 0, "generation" integer DEFAULT 1,
   "updatedAt" timestamptz DEFAULT now(), "lastError" text, "lockedUntil" timestamptz,
   "leaseToken" text, "nextAttemptAt" timestamptz, "completedAt" timestamptz);
   CREATE TABLE snapshots (id text PRIMARY KEY);`);
	});
	afterAll(async () => {
		if (first) {
			await first.query(`DROP SCHEMA "${schema}" CASCADE`);
			await first.end();
		}
		await second?.end();
	});
	async function reset() {
		await first.query('TRUNCATE "FinancialHistoryUnit", snapshots');
		await first.query(
			`INSERT INTO "FinancialHistoryUnit" ("id","kind","series","startDate","endDate","state") VALUES ('unit','CURRENCY','USD','2026-01-01','2026-01-01','PENDING')`,
		);
	}
	test("concurrent deliveries claim once and redelivery after commit adds no effects", async () => {
		await reset();
		let calls = 0;
		const operation = (client: Client) => async (_unit: unknown, fence: () => Promise<void>) => {
			calls++;
			await client.query("BEGIN");
			try {
				await fence();
				await client.query("INSERT INTO snapshots VALUES ('unit')");
				await client.query(
					`UPDATE "FinancialHistoryUnit" SET "state"='COMPLETED',"leaseToken"=NULL WHERE "id"='unit'`,
				);
				await client.query("COMMIT");
				return "COMPLETED" as const;
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			}
		};
		await Promise.all([
			runHistoryUnit(event, operation(first), execute(first)),
			runHistoryUnit(event, operation(second), execute(second)),
		]);
		await runHistoryUnit(event, operation(first), execute(first));
		expect(calls).toBe(1);
		expect((await first.query("SELECT count(*)::integer AS count FROM snapshots")).rows[0].count).toBe(1);
	});
	test("failure before commit rolls back data and retains retryable work", async () => {
		await reset();
		await expect(
			runHistoryUnit(
				event,
				async (_unit, fence) => {
					await first.query("BEGIN");
					try {
						await fence();
						await first.query("INSERT INTO snapshots VALUES ('unit')");
						throw new Error("crash before commit");
					} finally {
						await first.query("ROLLBACK");
					}
				},
				execute(first),
			),
		).rejects.toThrow("crash before commit");
		expect((await first.query("SELECT count(*)::integer AS count FROM snapshots")).rows[0].count).toBe(0);
		expect(
			(await first.query('SELECT "state","attempts" FROM "FinancialHistoryUnit"')).rows[0],
		).toMatchObject({ attempts: 1, state: "PENDING" });
	});
	test("recovered generation fences stale worker completion", async () => {
		await reset();
		await expect(
			runHistoryUnit(
				event,
				async (_unit, fence) => {
					await second.query(
						`UPDATE "FinancialHistoryUnit" SET "state"='PENDING',"generation"=2,"leaseToken"=NULL,"lockedUntil"=NULL WHERE "id"='unit'`,
					);
					await fence();
					return "COMPLETED";
				},
				execute(first),
			),
		).rejects.toThrow("Lease");
		expect(
			(await first.query('SELECT "state","generation" FROM "FinancialHistoryUnit"')).rows[0],
		).toMatchObject({ generation: 2, state: "PENDING" });
	});
});
