import { expect, test } from "bun:test";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import contract from "../migrations/snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract.json";

const url = requireFixtureUrl("DATABASE_TEST_URL");

test("complete CLI migration chain preserves destination monetary precision and current ledger views", async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		const columns = await client.query<{
			table_name: string;
			column_name: string;
			numeric_precision: number;
			numeric_scale: number;
		}>(
			"SELECT table_name,column_name,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND data_type='numeric'",
		);
		const tables = contract.storage.namespaces.public.entries.table;
		let checked = 0;
		for (const [table, definition] of Object.entries(tables)) {
			for (const [name, column] of Object.entries(definition.columns)) {
				if (column.nativeType !== "numeric") continue;
				const params = (column as { typeParams: { precision: number; scale: number } }).typeParams;
				expect(
					columns.rows.find(row => row.table_name === table && row.column_name === name),
				).toMatchObject({
					numeric_precision: params.precision,
					numeric_scale: params.scale,
				});
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(50);
		for (const view of ["CreditEntry", "CreditConsumption"])
			expect(
				(await client.query("SELECT to_regclass($1) AS name", [`public."${view}"`])).rows[0].name,
			).not.toBeNull();
		expect(
			(await client.query("SELECT to_regclass('public.\"CreditPurchase\"') AS name")).rows[0].name,
		).toBeNull();
	} finally {
		await client.end();
	}
});

test("tax catalog migration seeds once and preserves administrator changes", async () => {
	const { default: operations } = await import(
		"../migrations/app/20261011T2118_seed_tax_definitions/ops.json"
	);
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await client.query("BEGIN");
		for (const id of ["iof", "ir"])
			expect(
				(await client.query('SELECT "id" FROM "taxDefinition" WHERE "id"=$1', [id])).rowCount,
			).toBe(1);
		await client.query('UPDATE "taxDefinition" SET "name"=$1, "isActive"=false WHERE "id"=$2', [
			"IR personalizado",
			"ir",
		]);
		await client.query('UPDATE "taxDefinitionVersion" SET "applicationOrder"=7 WHERE "id"=$1', [
			"ir-initial",
		]);
		for (let attempt = 0; attempt < 2; attempt++)
			for (const operation of operations) {
				for (const statement of operation.execute) await client.query(statement.sql);
				for (const check of operation.postcheck)
					expect((await client.query(check.sql)).rows[0]?.result).toBe(true);
			}
		expect(
			(await client.query('SELECT "name", "isActive" FROM "taxDefinition" WHERE "id"=$1', ["ir"]))
				.rows[0],
		).toEqual({ isActive: false, name: "IR personalizado" });
		expect(
			(
				await client.query('SELECT "applicationOrder" FROM "taxDefinitionVersion" WHERE "id"=$1', [
					"ir-initial",
				])
			).rows[0]?.applicationOrder,
		).toBe(7);
		await client.query("ROLLBACK");
	} finally {
		await client.end();
	}
});
