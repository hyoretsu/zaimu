import { expect, test } from "bun:test";
import operations from "../migrations/app/20261008T0034_international_money_history/ops.json";
import contract from "../migrations/snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract.json";

test("monetary precision SQL matches the destination contract for every altered column", () => {
	const operation = operations.find(item => item.id === "internationalMoney.precisionWithCreditViews");
	expect(operation).toBeDefined();
	const sql = operation!.execute.map(statement => statement.sql).join("\n");
	const alterations = [
		...sql.matchAll(
			/ALTER TABLE public\."([^"]+)" ALTER COLUMN "([^"]+)" TYPE numeric\((\d+),(\d+)\) USING "([^"]+)"::numeric\((\d+),(\d+)\)/g,
		),
	];
	expect(alterations.length).toBeGreaterThan(0);
	const tables = contract.storage.namespaces.public.entries.table;
	for (const [, table, column, precision, scale, castColumn, castPrecision, castScale] of alterations) {
		const columns = tables[table as keyof typeof tables].columns;
		const expected = columns[column as keyof typeof columns] as {
			typeParams: { precision: number; scale: number };
		};
		expect({ column, precision: Number(precision), scale: Number(scale), table }).toEqual({
			column,
			table,
			...expected.typeParams,
		});
		expect([castColumn, castPrecision, castScale]).toEqual([column, precision, scale]);
	}
});
