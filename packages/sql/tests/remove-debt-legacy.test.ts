import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import cutover from "../migrations/app/20261002T1719_remove_debt_legacy/ops.json";
import contract from "../migrations/snapshots/2959d551a33a438c69e904f3222fb3b053b98e9f92be5a047827b7e5853f53a0/contract.json";
import { assertLocalRecurrenceTestUrl, installContractFixture } from "./contract-fixture";

const url = requireFixtureUrl("DEBT_TEST_URL");
async function fixture(client: Client) {
	await installContractFixture(client, contract);
	await client.query(`
INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner');
INSERT INTO "DebtPerson" ("id","userId","name","normalizedName") VALUES ('p','owner','Ana','ana');
INSERT INTO "Debt" ("id","userId","personName","amount","isPaid","date","paidDate") VALUES ('paid','owner','Ana',10,true,'2025-01-01','2025-02-02'),('deleted','owner','Ana',20,false,null,null);
INSERT INTO "DebtHistory" ("id","debtId","field","oldValue","newValue") VALUES ('h','paid','amount','5','10');
INSERT INTO "DebtEvent" ("id","createdByUserId","debtPersonId","amount","effect","date","kind") VALUES ('paid','owner','p',10,10,'2025-01-01','ORIGIN'),('settled','owner','p',10,-10,'2025-02-02','MIGRATED_SETTLEMENT'),('edited','owner','p',3,-3,null,'ORIGIN');
`);
}
async function migrate(client: Client) {
	for (const op of cutover) for (const statement of op.execute) await client.query(statement.sql);
}
describe("debt legacy cutover", () => {
	test("ledger edits and compensation remain exact; historical deletions become tombstones", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await fixture(client);
			await migrate(client);
			expect(
				(
					await client.query(
						'SELECT sum("effect")::text AS value FROM "DebtEvent" WHERE "deletedAt" IS NULL',
					)
				).rows[0].value,
			).toBe("-3.00");
			expect(
				(await client.query('SELECT "deletedAt" FROM "DebtEvent" WHERE "id"=\'deleted\'')).rows[0]
					.deletedAt,
			).toBeTruthy();
			expect(
				(
					await client.query(
						'SELECT "original" FROM "ApplicationUpgradeArchive" WHERE "source"=\'DebtSettlementProof\'',
					)
				).rows[0].original,
			).toMatchObject({ amount: 10, date: "2025-02-02", effect: -10 });
			expect(
				(
					await client.query(
						'SELECT "original" FROM "ApplicationUpgradeArchive" WHERE "source"=\'DebtHistory\'',
					)
				).rows[0].original.oldValue,
			).toBe("5");
			expect(
				(await client.query("SELECT to_regclass('\"Debt\"') AS relation")).rows[0].relation,
			).toBeNull();
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	});
	test("archive divergence and late failure restore sources", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await fixture(client);
			await client.query(
				'INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original") VALUES (\'Debt\',\'paid\',\'owner\',\'{}\')',
			);
			await client.query("SAVEPOINT before_cutover");
			await expect(migrate(client)).rejects.toThrow("Debt archive mismatch");
			await client.query("ROLLBACK TO SAVEPOINT before_cutover");
			expect((await client.query('SELECT * FROM "Debt"')).rows).toHaveLength(2);
			await client.query('DELETE FROM "ApplicationUpgradeArchive"');
			await migrate(client);
			await expect(client.query("SELECT 1/0")).rejects.toThrow();
			await client.query("ROLLBACK TO SAVEPOINT before_cutover");
			expect((await client.query('SELECT * FROM "DebtHistory"')).rows).toHaveLength(1);
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	});
});
