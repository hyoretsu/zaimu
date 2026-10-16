#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract";
import startContract from "../../snapshots/3396a7ca1c28bf16ba91ad4c1a4d5fda50876f2b6643c75389c497440205b3cd/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/c4edc511da606d6f56de1ba919432d200f7ceba27af5790c599578b05989b88f/contract";
import endContract from "../../snapshots/c4edc511da606d6f56de1ba919432d200f7ceba27af5790c599578b05989b88f/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("creditCardRules", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addColumn({
				column: col("creditCardRules", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialInstitutionProfile",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
