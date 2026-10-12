#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/4b738b2f5203071c97a45b5be12d9d64c20af7c187530a08ae5d6c311585e620/contract";
import startContract from "../../snapshots/4b738b2f5203071c97a45b5be12d9d64c20af7c187530a08ae5d6c311585e620/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/c0d0801fc32800aab2e74595bb0478dad21a1385021d951b17a8a8b24e748d5e/contract";
import endContract from "../../snapshots/c0d0801fc32800aab2e74595bb0478dad21a1385021d951b17a8a8b24e748d5e/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("historicalYieldSettings", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialAccount",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
