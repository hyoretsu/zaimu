import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { createEventEnvelope } from "~/shared/application/events";
import type { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { requestHistoryCollection, runHistoryUnit } from "../application/history-collections";

import { referenceRateCoveredDaysSql } from "../application/reference-rate-coverage-sql";

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
   "id" text PRIMARY KEY, "deduplicationKey" text UNIQUE, "kind" text, "series" text, "startDate" date, "endDate" date,
   "state" text DEFAULT 'PENDING', "attempts" integer DEFAULT 0, "generation" integer DEFAULT 0,
   "updatedAt" timestamptz DEFAULT now(), "lastError" text, "lockedUntil" timestamptz,
   "leaseToken" text, "nextAttemptAt" timestamptz, "completedAt" timestamptz);
   CREATE TABLE snapshots (id text PRIMARY KEY);
   CREATE TABLE "ReferenceRate" ("type" text, "date" date, "value" numeric);
   CREATE TABLE "OutboxEvent" ("eventType" text, "payload" jsonb);
   CREATE TABLE "FinancialHistoryCollection" ("id" text PRIMARY KEY, "deduplicationKey" text UNIQUE, "kind" text, "startDate" date, "endDate" date, "series" json);
   CREATE TABLE "FinancialHistoryCollectionUnit" ("collectionId" text, "unitId" text, PRIMARY KEY ("collectionId", "unitId"));`);
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
			`INSERT INTO "FinancialHistoryUnit" ("id","kind","series","startDate","endDate","state","generation") VALUES ('unit','CURRENCY','USD','2026-01-01','2026-01-01','PENDING',1)`,
		);
	}
	test("populated history publishes only remaining days and repeats no work", async () => {
		await first.query(
			'TRUNCATE "FinancialHistoryUnit", "FinancialHistoryCollection", "FinancialHistoryCollectionUnit", "ReferenceRate", "OutboxEvent"',
		);
		await first.query(
			`INSERT INTO "ReferenceRate" SELECT 'CDI', day, 0.04 FROM generate_series('2016-10-08'::date,'2026-10-07'::date,interval '1 day') day WHERE day::date NOT IN ('2020-02-28','2020-02-29','2026-10-07')`,
		);
		// An already verified no-publication day requires no repeat download.
		await first.query(
			`INSERT INTO "OutboxEvent" VALUES ('referenceRate.historyFetched', '{"referenceType":"CDI","startDate":"2026-10-07","endDate":"2026-10-07"}')`,
		);
		const published: { startDate: string; endDate: string }[] = [];
		const transaction = (async (operation: (query: ReturnType<typeof execute>) => Promise<unknown>) => {
			await first.query("BEGIN");
			try {
				const result = await operation(execute(first));
				await first.query("COMMIT");
				return result;
			} catch (error) {
				await first.query("ROLLBACK");
				throw error;
			}
		}) as typeof withRawTransaction;
		const dependencies = {
			publish: async (unit: { startDate: string; endDate: string }) => {
				published.push(unit);
			},
			read: async () => null,
			transaction,
		};
		await requestHistoryCollection("INTEREST", ["CDI"], "2026-10-08", dependencies);
		expect(published.map(row => [row.startDate, row.endDate])).toEqual([["2020-02-28", "2020-02-29"]]);
		await requestHistoryCollection("INTEREST", ["CDI"], "2026-10-08", dependencies);
		expect(published).toHaveLength(1);
		await first.query(
			`INSERT INTO "ReferenceRate" VALUES ('CDI','2020-02-28',0.04), ('CDI','2020-02-29',0.04)`,
		);
		await requestHistoryCollection("INTEREST", ["CDI"], "2026-10-08", dependencies);
		expect(published).toHaveLength(1);
		expect(
			(
				await first.query(
					`SELECT count(*)::int AS count FROM "FinancialHistoryUnit" WHERE "state"<>'COMPLETED'`,
				)
			).rows[0].count,
		).toBe(0);
		const covered = (await first.query(referenceRateCoveredDaysSql, ["CDI", "2026-10-06", "2026-10-07"]))
			.rows;
		expect(covered.map(row => row.date).sort()).toEqual(["2026-10-06", "2026-10-07"]);
		await first.query(
			'TRUNCATE "FinancialHistoryCollectionUnit", "FinancialHistoryCollection", "FinancialHistoryUnit", "ReferenceRate", "OutboxEvent"',
		);
	});

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
