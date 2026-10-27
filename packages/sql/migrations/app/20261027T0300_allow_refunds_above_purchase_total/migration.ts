#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type {
	Contract as End,
	Contract as Start,
} from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract";
import endContract from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract.json" with { type: "json" };
import startContract from "../../snapshots/761180a121bb1b5cbb68975d303828540dccb199deacc27099061aa25b8bcb86/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			rawSql({
				execute: [
					{
						description: "Remove purchase refund ceiling",
						sql: readFileSync(new URL("./repair.sql", import.meta.url), "utf8"),
					},
				],
				id: "creditPurchases.allowExcessRefunds",
				invariantId: "creditPurchases.allowExcessRefunds.v1",
				label: "Allow refunds above purchase total while preserving ledger integrity",
				operationClass: "data",
				postcheck: [
					{
						description: "Verify refund ceiling is absent",
						sql: `SELECT position('Refunds exceed purchase total' in pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure)) = 0 AS result`,
					},
				],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
