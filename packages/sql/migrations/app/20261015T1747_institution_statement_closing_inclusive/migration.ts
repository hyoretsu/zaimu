#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/1af6555f5c8abd8ae4855fa102dc56268efae3f3ff4aa9d11bf5c4c484bf5833/contract";
import startContract from "../../snapshots/1af6555f5c8abd8ae4855fa102dc56268efae3f3ff4aa9d11bf5c4c484bf5833/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract";
import endContract from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("creditStatementClosingInclusive", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
