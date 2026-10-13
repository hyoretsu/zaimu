#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/c0d0801fc32800aab2e74595bb0478dad21a1385021d951b17a8a8b24e748d5e/contract";
import startContract from "../../snapshots/c0d0801fc32800aab2e74595bb0478dad21a1385021d951b17a8a8b24e748d5e/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/d2183e727953a3c8a7f1af3bc9c563c061539dfa4da4f82745bd6e994244ee70/contract";
import endContract from "../../snapshots/d2183e727953a3c8a7f1af3bc9c563c061539dfa4da4f82745bd6e994244ee70/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("parentBudgetId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createIndex({
				columns: ["parentBudgetId"],
				index: "MonthlyBudget_parentBudgetId_idx",
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["parentBudgetId"],
					name: "MonthlyBudget_parentBudgetId_fkey",
					onDelete: "restrict",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "MonthlyBudget" },
				},
				schema: "public",
				table: "MonthlyBudget",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
