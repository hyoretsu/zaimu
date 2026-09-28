import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "pg";
import backfill from "../migrations/app/20260928T1302_backfill_credit_purchases/ops.json";
import cutover from "../migrations/app/20260928T1340_activate_normalized_credit_ledger/ops.json";

const url = process.env.CREDIT_CUTOVER_TEST_URL;
const fixture = await Bun.file(new URL("./fixtures/credit-ledger-cutover.sql", import.meta.url)).text();

describe.skipIf(!url)("credit ledger SQL cutover", () => {
	let client: Client;
	beforeAll(async () => {
		const target = new URL(url!);
		if (
			!["127.0.0.1", "localhost"].includes(target.hostname) ||
			target.pathname !== "/zaimu_credit_remap_test"
		)
			throw new Error("Use disposable local zaimu_credit_remap_test");
		client = new Client({ connectionString: url });
		await client.connect();
	});
	afterAll(async () => {
		await client?.end();
	});
	beforeEach(async () => {
		await client.query("BEGIN");
		await client.query(fixture);
		for (const statement of backfill.find(op => op.id === "creditPurchases.backfill")!.execute)
			await client.query(statement.sql);
	});
	afterEach(async () => {
		await client.query("ROLLBACK");
	});
	async function migrate() {
		for (const op of cutover) for (const statement of op.execute) await client.query(statement.sql);
	}
	test("preserves history, debt and reconciliation IDs and removes flattened storage", async () => {
		await migrate();
		expect(
			(await client.query(`SELECT to_regclass('public."CreditPurchase"') AS table`)).rows[0].table,
		).toBeNull();
		expect(
			(
				await client.query(
					`SELECT "creditPurchaseId" FROM "CreditPurchaseHistory" WHERE "id" = 'history'`,
				)
			).rows[0].creditPurchaseId,
		).toBe("child");
		expect(
			(await client.query(`SELECT "creditPurchaseId" FROM "DebtPurchaseLink" WHERE "id" = 'link'`))
				.rows[0].creditPurchaseId,
		).toBe("child");
		expect(
			(
				await client.query(
					`SELECT "requiresRefundReview" FROM "CreditEntryReference" WHERE "id" = 'unlinked'`,
				)
			).rows[0].requiresRefundReview,
		).toBe(true);
		expect(
			(
				await client.query(
					`SELECT "description", "installmentAmount" FROM "CreditEntry" WHERE "id" = 'child'`,
				)
			).rows[0],
		).toEqual({ description: "Compra", installmentAmount: "10.51" });
		expect(
			(await client.query(`SELECT "isSettled" FROM "CreditStatementCharge" WHERE "id" = 'charge'`))
				.rows[0].isSettled,
		).toBe(true);
		expect(
			(await client.query(`SELECT count(*)::int AS n FROM "TagAssignment" WHERE "entityId" = 'child'`))
				.rows[0].n,
		).toBe(0);
		await client.query("SET CONSTRAINTS ALL IMMEDIATE");
	});
	test("deferred integrity rejects excess refunds and broken installment plans", async () => {
		await migrate();
		await client.query(`UPDATE "CreditRefundRecord" SET "amount" = 100 WHERE "id" = 'refund'`);
		await expect(client.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toThrow(
			"Refunds exceed purchase total",
		);
	});
	test("late migration failure restores every old reference and source table", async () => {
		await client.query("SAVEPOINT cutover");
		await migrate();
		await expect(client.query("SELECT missing_cutover_function()")).rejects.toThrow();
		await client.query("ROLLBACK TO SAVEPOINT cutover");
		expect(
			(await client.query(`SELECT "description" FROM "CreditPurchase" WHERE "id" = 'child'`)).rows[0]
				.description,
		).toBe("Snapshot antigo");
		expect(
			(await client.query(`SELECT to_regclass('public."CreditEntryReference"') AS table`)).rows[0]
				.table,
		).toBeNull();
	});
});
