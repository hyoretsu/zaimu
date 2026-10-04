#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/cefc24e812413f0dc86f6896aafa5b1e75287baca760266bf194f867c2421e96/contract";
import startContract from "../../snapshots/cefc24e812413f0dc86f6896aafa5b1e75287baca760266bf194f867c2421e96/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e598837aec6b0359bd47c41caaff1643d4361b7b0dab398febf06e25f94e516c/contract";
import endContract from "../../snapshots/e598837aec6b0359bd47c41caaff1643d4361b7b0dab398febf06e25f94e516c/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("isDefaultForStatements", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
