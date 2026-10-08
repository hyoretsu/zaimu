import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import cutover from "../migrations/app/20261002T1740_remove_financial_legacy/ops.json";
import contract from "../migrations/snapshots/dcd9827e30f5e5c90521b127eb7cad4d1bd128c76b3328c3d93e7b79b01b225b/contract.json";
import { assertLocalRecurrenceTestUrl, installContractFixture } from "./contract-fixture";

const url = requireFixtureUrl("FINANCIAL_TEST_URL");
async function fixture(client: Client) {
	await installContractFixture(client, contract);
	await client.query(`
 INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner');
 INSERT INTO "FinancialAccount" ("id","userId") VALUES ('account','owner');
 INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","dueDay","statementDay") VALUES ('card','account',1000,10,1);
 INSERT INTO "CreditCardStatement" ("id","creditCardId","dueDate","statementDate") VALUES ('statement','card','2026-10-10','2026-10-01');
 INSERT INTO "Category" ("id","userId","name") VALUES ('tag','owner','Tag');
 INSERT INTO "Transaction" ("id","userId","amount","date","categoryId") VALUES ('transaction','owner',12.34,'2026-10-01','tag');
 INSERT INTO "CreditEntryReference" ("id","requiresRefundReview") VALUES ('refund',true);
 INSERT INTO "CreditPurchaseLegacyEntry" ("id","original") VALUES ('refund','{"statementId":"statement","totalAmount":-5,"description":"Refund"}');
 `);
}
async function migrate(client: Client) {
	for (const op of cutover) for (const statement of op.execute) await client.query(statement.sql);
}
describe("financial legacy cutover", () => {
	test("transfers pending reviews and scalar tags without changing ledger", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await fixture(client);
			await migrate(client);
			expect(
				(await client.query('SELECT "userId","creditCardId","original" FROM "CreditRefundReview"'))
					.rows,
			).toEqual([
				{
					creditCardId: "card",
					original: { description: "Refund", statementId: "statement", totalAmount: -5 },
					userId: "owner",
				},
			]);
			expect((await client.query('SELECT "amount"::text FROM "Transaction"')).rows[0].amount).toBe(
				"12.34",
			);
			expect(
				(await client.query('SELECT "categoryId","entityType","entityId" FROM "TagAssignment"')).rows,
			).toEqual([{ categoryId: "tag", entityId: "transaction", entityType: "TRANSACTION" }]);
			expect(
				(await client.query("SELECT to_regclass('\"CreditPurchaseLegacyEntry\"') AS relation"))
					.rows[0].relation,
			).toBeNull();
			expect(
				(
					await client.query(
						'SELECT "original" FROM "ApplicationUpgradeArchive" WHERE "source"=\'CreditPurchaseLegacyEntry\'',
					)
				).rows[0].original.original.totalAmount,
			).toBe(-5);
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	});
	test("unresolvable review and late failure keep original sources", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await fixture(client);
			await client.query('UPDATE "CreditPurchaseLegacyEntry" SET "original"=\'{}\'');
			await client.query("SAVEPOINT before_cutover");
			await expect(migrate(client)).rejects.toThrow("Orphan credit");
			await client.query("ROLLBACK TO SAVEPOINT before_cutover");
			expect((await client.query('SELECT "categoryId" FROM "Transaction"')).rows[0].categoryId).toBe(
				"tag",
			);
			await client.query(
				'UPDATE "CreditPurchaseLegacyEntry" SET "original"=\'{"statementId":"statement"}\'',
			);
			await migrate(client);
			await expect(client.query("SELECT 1/0")).rejects.toThrow();
			await client.query("ROLLBACK TO SAVEPOINT before_cutover");
			expect(
				(await client.query('SELECT count(*)::int AS count FROM "CreditPurchaseLegacyEntry"')).rows[0]
					.count,
			).toBe(1);
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	});
});
