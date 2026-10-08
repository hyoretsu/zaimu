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
