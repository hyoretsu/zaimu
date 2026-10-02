import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import operations from "../migrations/app/20261002T1640_application_upgrade_audit/ops.json";
import contract from "../migrations/snapshots/f455efbeae9a441e883befa794486f417ce17c903acc3e5fe483c941ed82879d/contract.json";
import { assertLocalRecurrenceTestUrl, installContractFixture } from "./contract-fixture";

const url = process.env.RECURRENCE_TEST_URL;
describe.skipIf(!url)("application upgrade evidence", () => {
	test("preserves collision mappings, deleted destinations, owner boundaries and originals", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await installContractFixture(client, contract);
			await client.query(`
INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner'),('other','other@example.test','Other');
INSERT INTO "RecurringPayment" ("id","userId","name","amount","startDate","frequency") VALUES ('same','owner','Expense',30,'2024-01-01','MONTHLY');
INSERT INTO "Salary" ("id","userId","source","amount","payDay","startDate") VALUES ('same','owner','Receipt',10,1,'2024-01-01');
INSERT INTO "Subscription" ("id","userId","name","amount","billingDay","startDate") VALUES ('same','owner','Deleted',20,1,'2024-01-01');
INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","startDate","legacySource","legacyId") VALUES
 ('same','owner','Expense',30,'EXPENSE','MONTH','2024-01-01','recurring','same'),
 ('sql-collision-id','owner','Receipt',10,'INCOME','MONTH','2024-01-01','salary','same');
INSERT INTO "SalaryHistory" ("id","salaryId","field","oldValue","newValue") VALUES ('h','same','amount','5','10');
`);
			for (const operation of operations)
				for (const statement of operation.execute)
					await client.query(statement.sql, "params" in statement ? statement.params : []);
			const mappings = (await client.query('SELECT * FROM "ApplicationUpgradeRecurrence"')).rows;
			expect(mappings).toHaveLength(3);
			expect(mappings.find(row => row.source === "salary").recurrenceId).toBe("sql-collision-id");
			expect(mappings.find(row => row.source === "subscription").deletedAt).not.toBeNull();
			expect(
				(await client.query('SELECT * FROM "ApplicationUpgradeRecurrence" WHERE "userId"=\'other\''))
					.rows,
			).toHaveLength(0);
			expect(
				(
					await client.query(
						'SELECT "original" FROM "ApplicationUpgradeArchive" WHERE "source"=\'SalaryHistory\'',
					)
				).rows[0].original,
			).toMatchObject({ id: "h", newValue: "10", oldValue: "5" });
			await client.query('DELETE FROM "Recurrence" WHERE "id"=\'sql-collision-id\'');
			expect(
				(await client.query('SELECT * FROM "ApplicationUpgradeRecurrence" WHERE "source"=\'salary\''))
					.rows[0].deletedAt,
			).not.toBeNull();
			expect(
				(
					await client.query(
						'SELECT sum(("original"->>\'amount\')::numeric)::text AS total FROM "ApplicationUpgradeArchive"',
					)
				).rows[0].total,
			).toBe("60.00");
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
	test("late failure rolls back archive and mapping DDL together", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await installContractFixture(client, contract);
			await client.query("SAVEPOINT before_upgrade");
			for (const operation of operations)
				for (const statement of operation.execute)
					await client.query(statement.sql, "params" in statement ? statement.params : []);
			await expect(client.query("SELECT 1/0")).rejects.toThrow();
			await client.query("ROLLBACK TO SAVEPOINT before_upgrade");
			expect(
				(await client.query("SELECT to_regclass('\"ApplicationUpgradeArchive\"') AS relation"))
					.rows[0].relation,
			).toBeNull();
			expect(
				(await client.query("SELECT to_regclass('\"ApplicationUpgradeRecurrence\"') AS relation"))
					.rows[0].relation,
			).toBeNull();
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
});
