import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { cashbackReversalsSql } from "../application/cashback-reversals-sql";

const url = process.env.CASHBACK_SQL_TEST_URL;
describe.skipIf(!url)("native cashback SQL", () => {
	let client: Client;
	beforeAll(async () => {
		const parsed = new URL(url!);
		if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.pathname !== "/zaimu_cashback_test")
			throw new Error("Teste exige banco descartável local zaimu_cashback_test");
		client = new Client({ connectionString: url });
		await client.connect();
		await client.query(`
   CREATE TEMP TABLE "FinancialAccount" ("id" text PRIMARY KEY,"currency" text);
   CREATE TEMP TABLE "CreditPurchaseRecord" ("id" text PRIMARY KEY,"cashbackAccountId" text,"cashbackAmount" numeric,"totalAmount" numeric);
   CREATE TEMP TABLE "CreditRefundRecord" ("id" text PRIMARY KEY,"purchaseId" text,"amount" numeric,"creditDate" date,"createdAt" timestamp,"deletedAt" timestamp);
   INSERT INTO "FinancialAccount" VALUES ('jpy','JPY'),('kwd','KWD');
   INSERT INTO "CreditPurchaseRecord" VALUES ('a','jpy',1,3),('b','kwd',1.001,3);
   INSERT INTO "CreditRefundRecord" SELECT purchase, purchase,1,'2026-01-02','2026-01-02',NULL FROM (VALUES ('a'),('b')) AS sources(purchase);
   INSERT INTO "CreditRefundRecord" SELECT purchase||'2', purchase,1,'2026-01-03','2026-01-03',NULL FROM (VALUES ('a'),('b')) AS sources(purchase);
   INSERT INTO "CreditRefundRecord" SELECT purchase||'3', purchase,1,'2026-01-04','2026-01-04',NULL FROM (VALUES ('a'),('b')) AS sources(purchase);
   INSERT INTO "CreditRefundRecord" VALUES ('deleted','a',1,'2026-01-01','2026-01-01','2026-01-01');
  `);
	});
	afterAll(async () => {
		await client?.end();
	});
	test("multiple refunds conserve native booked reward and exclude deleted records", async () => {
		const { rows } = await client.query(
			`SELECT "purchaseId",amount FROM (${cashbackReversalsSql}) movements ORDER BY "purchaseId","date"`,
		);
		expect(rows.filter(row => row.purchaseId === "a").map(row => Number(row.amount))).toEqual([0, -1, 0]);
		expect(rows.filter(row => row.purchaseId === "b").map(row => Number(row.amount))).toEqual([
			-0.334, -0.333, -0.334,
		]);
		expect(rows).toHaveLength(6);
	});
});
