import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import audit from "../migrations/app/20261002T1640_application_upgrade_audit/ops.json";
import cutover from "../migrations/app/20261002T1655_remove_recurrence_legacy/ops.json";
import contract from "../migrations/snapshots/f455efbeae9a441e883befa794486f417ce17c903acc3e5fe483c941ed82879d/contract.json";
import { assertLocalRecurrenceTestUrl, installContractFixture } from "./contract-fixture";

const url = process.env.RECURRENCE_TEST_URL;
async function execute(client: Client, ops: Array<{ execute: Array<{ sql: string }> }>) {
	for (const operation of ops) for (const statement of operation.execute) await client.query(statement.sql);
}
async function fixture(client: Client) {
	await installContractFixture(client, contract);
	await client.query(`
 CREATE VIEW "CreditEntry" AS SELECT "subscriptionId","subscriptionOccurrenceDate" FROM "CreditPurchaseRecord";
 CREATE VIEW "CreditConsumption" AS SELECT "subscriptionId","subscriptionOccurrenceDate" FROM "CreditPurchaseRecord";
 INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner');
 INSERT INTO "FinancialAccount" ("id","userId","name","type") VALUES ('bank','owner','Bank','CHECKING'),('card-account','owner','Card','CREDIT_CARD');
 INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('card','card-account',1000,15,25);
 INSERT INTO "Salary" ("id","userId","source","amount","payDay","startDate") VALUES ('same','owner','Receipt',10,1,'2024-01-01');
 INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","startDate","legacySource","legacyId") VALUES ('same','owner','Receipt',10,'INCOME','MONTH','2024-01-01','salary','same');
 INSERT INTO "Transaction" ("id","userId","amount","date","recurrenceId","recurrenceOccurrenceDate") VALUES ('tx','owner',10,'2024-01-01','same','2024-01-01');
 INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","totalAmount","purchaseDate","subscriptionId","subscriptionOccurrenceDate") VALUES ('purchase','owner','card','Purchase',20,'2024-01-01','same','2024-01-01');
 INSERT INTO "DebtSplit" ("id","userId","mode","recurringPaymentId") VALUES ('split','owner','SHARES','same');
 INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","deletedAt") VALUES ('same','2024-02-01',CURRENT_TIMESTAMP);
 `);
	await execute(client, audit);
}
describe.skipIf(!url)("recurrence legacy cutover", () => {
	test("keeps amounts, references and tombstones while removing historic contracts", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await fixture(client);
			await execute(client, cutover);
			expect(
				(
					await client.query(
						'SELECT "recurrenceId","recurrenceOccurrenceDate" FROM "CreditPurchaseRecord"',
					)
				).rows[0].recurrenceId,
			).toBe("same");
			expect((await client.query('SELECT "recurrenceId" FROM "DebtSplit"')).rows[0].recurrenceId).toBe(
				"same",
			);
			expect(
				(await client.query('SELECT sum("amount")::text AS total FROM "Transaction"')).rows[0].total,
			).toBe("10.00");
			expect(
				(await client.query('SELECT * FROM "RecurrenceOccurrence" WHERE "deletedAt" IS NOT NULL'))
					.rows,
			).toHaveLength(1);
			expect(
				(await client.query('SELECT "recurrenceId" FROM "CreditEntry"')).rows[0].recurrenceId,
			).toBe("same");
			expect(
				(await client.query("SELECT to_regclass('\"Salary\"') AS relation")).rows[0].relation,
			).toBeNull();
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
	test("divergent original aborts removal and late rollback restores renamed columns", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await fixture(client);
			await client.query("SAVEPOINT before_cutover");
			await client.query('UPDATE "Salary" SET "amount"=11');
			await expect(execute(client, cutover)).rejects.toThrow("Legacy audit mismatch");
			await client.query("ROLLBACK TO SAVEPOINT before_cutover");
			expect(
				(await client.query('SELECT "subscriptionId" FROM "CreditPurchaseRecord"')).rows[0]
					.subscriptionId,
			).toBe("same");
			await execute(client, cutover);
			await expect(client.query("SELECT 1/0")).rejects.toThrow();
			await client.query("ROLLBACK TO SAVEPOINT before_cutover");
			expect(
				(await client.query('SELECT "subscriptionId" FROM "CreditPurchaseRecord"')).rows[0]
					.subscriptionId,
			).toBe("same");
			expect((await client.query('SELECT "amount" FROM "Salary"')).rows).toHaveLength(1);
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
});
