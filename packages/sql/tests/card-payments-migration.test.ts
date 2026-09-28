import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import { calculateStatementBalances } from "../../finance/src/credit-card";
import operations from "../migrations/app/20260928T0112_card_payments/ops.json";

const url = process.env.CARD_PAYMENTS_TEST_URL;

// Dedicated disposable database only. Never fall back to the application's database URL.
describe.skipIf(!url)("local payment migration", () => {
	test("executes emitted payment migration, preserving transactions and pending imports", async () => {
		const target = new URL(url!);
		if (
			!["localhost", "127.0.0.1"].includes(target.hostname) ||
			!target.pathname.startsWith("/zaimu_payment_test")
		)
			throw new Error("Migration test requires a dedicated local zaimu_payment_test database");
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await client.query(`
   CREATE TABLE "CreditCard" ("id" varchar(36) PRIMARY KEY, "statementDay" integer, "dueDay" integer);
   CREATE TABLE "CreditCardStatement" ("id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "creditCardId" varchar(36) REFERENCES "CreditCard"("id"), "statementDate" date, "dueDate" date,
    "totalAmount" numeric(12,2) DEFAULT 0, "paidAmount" numeric(12,2) DEFAULT 0, "isPaid" boolean DEFAULT false,
    UNIQUE ("creditCardId", "statementDate"));
   CREATE TABLE "Transaction" ("id" varchar(36) PRIMARY KEY, "creditCardStatementId" varchar(36),
    "amount" numeric(12,2), "date" date, "time" text, "originFinancialAccountId" text, "description" text,
    "history" jsonb, CONSTRAINT "Transaction_creditCardStatementId_fkey" FOREIGN KEY ("creditCardStatementId") REFERENCES "CreditCardStatement"("id"));
   CREATE INDEX "Transaction_creditCardStatementId_idx" ON "Transaction" ("creditCardStatementId");
   CREATE TABLE "TransactionImportItem" ("id" varchar(36) PRIMARY KEY, "creditCardStatementId" varchar(36),
    "amount" numeric(12,2), "date" date, "time" text, "originFinancialAccountId" text, "reconciledTransactionId" text,
    CONSTRAINT "TransactionImportItem_creditCardStatementId_fkey" FOREIGN KEY ("creditCardStatementId") REFERENCES "CreditCardStatement"("id"));
   CREATE INDEX "TransactionImportItem_creditCardStatementId_idx" ON "TransactionImportItem" ("creditCardStatementId");
   CREATE TABLE "CreditPurchase" ("id" text PRIMARY KEY, "description" text, "cashbackAccountId" text, "cashbackAmount" numeric);
   CREATE TABLE "CreditCardImport" ("id" text PRIMARY KEY);
   CREATE TABLE "CreditCardImportItem" ("id" text PRIMARY KEY, "description" text);
   INSERT INTO "CreditCard" VALUES ('card',15,25), ('other',25,3), ('empty',31,31);
   INSERT INTO "CreditCardStatement" ("id","creditCardId","statementDate","dueDate","totalAmount") VALUES
    ('august','card','2024-08-15','2024-08-25',100), ('september','card','2024-09-15','2024-09-28',92),
    ('short-month','other','2024-01-25','2024-02-03',50);
   INSERT INTO "Transaction" VALUES
    ('partial','august',40,'2024-08-25','14:33','account','payment','{"reconciled":"a","createdAt":"2024-08-25"}'),
    ('late','august',152,'2024-09-28','08:22','account','late payment','{"reconciled":"b"}'),
    ('credit','september',30,'2024-10-25',NULL,'account','credit','{}'),
    ('other-payment','short-month',50,'2024-02-03',NULL,'other-account','payment','{}'),
    ('ordinary',NULL,10,'2024-08-01','12:00','account','expense','{}');
   INSERT INTO "TransactionImportItem" VALUES ('pending','august',55.15,'2024-09-26','10:14','account','partial');
   INSERT INTO "CreditPurchase" VALUES ('interest','Juros de mora','account',1), ('store','Loja','account',2);
   INSERT INTO "CreditCardImportItem" VALUES ('iof','IOF ROTATIVO');
  `);
			const before = (await client.query('SELECT * FROM "Transaction" ORDER BY "id"')).rows;
			const importsBefore = (await client.query('SELECT * FROM "TransactionImportItem" ORDER BY "id"'))
				.rows;
			const expectedCard = new Map([
				["august", "card"],
				["september", "card"],
				["short-month", "other"],
			]);
			for (const operation of operations) {
				for (const check of operation.precheck) {
					const result = await client.query(check.sql, "params" in check ? check.params : []);
					expect(result.rows[0]?.result).toBe(true);
				}
				for (const statement of operation.execute)
					await client.query(statement.sql, "params" in statement ? statement.params : []);
				for (const check of operation.postcheck) {
					const result = await client.query(check.sql, "params" in check ? check.params : []);
					expect(result.rows[0]?.result).toBe(true);
				}
			}
			const migrated = (rows: typeof before) =>
				rows.map(({ creditCardStatementId, ...row }) => ({
					...row,
					paymentCreditCardId: expectedCard.get(creditCardStatementId) ?? null,
				}));
			expect((await client.query('SELECT * FROM "Transaction" ORDER BY "id"')).rows).toEqual(
				migrated(before),
			);
			expect((await client.query('SELECT * FROM "TransactionImportItem" ORDER BY "id"')).rows).toEqual(
				migrated(importsBefore),
			);
			const invoices = (
				await client.query(
					'SELECT *, "statementDate"::text AS "statementDate", "dueDate"::text AS "dueDate" FROM "CreditCardStatement" s ORDER BY s."dueDate", s."id"',
				)
			).rows;
			const today = (await client.query("SELECT CURRENT_DATE::text AS date")).rows[0].date;
			for (const cardId of ["card", "other"]) {
				const payments = before.filter(row => expectedCard.get(row.creditCardStatementId) === cardId);
				const replay = calculateStatementBalances(
					invoices.filter(row => row.creditCardId === cardId),
					payments,
					today,
				);
				for (const row of replay) {
					expect(Number(invoices.find(s => s.id === row.id).paidAmount)).toBe(row.paidAmount);
					expect(invoices.find(s => s.id === row.id).isPaid).toBe(row.isPaid);
				}
			}
			expect(invoices.find(s => s.id === "august")).toMatchObject({
				isPaid: false,
				paidAmount: "40.00",
			});
			expect(invoices.find(s => s.id === "september")).toMatchObject({
				dueDate: "2024-09-28",
				isPaid: true,
				paidAmount: "152.00",
			});
			expect(invoices.some(s => s.creditCardId === "empty")).toBe(false);
			expect(
				(await client.query('SELECT * FROM "CreditPurchase" WHERE "id" = \'interest\'')).rows[0],
			).toMatchObject({ cashbackAccountId: null, cashbackAmount: null, isStatementCharge: true });
			expect(
				(await client.query('SELECT * FROM "CreditCardImportItem"')).rows[0].isStatementCharge,
			).toBe(true);
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
});
