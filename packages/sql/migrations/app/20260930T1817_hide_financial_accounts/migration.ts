#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/6cd2e5e500f0c928b1e6fc63086d9eaf5867c8478fb31658bdd2857ea2eeab19/contract";
import endContract from "../../snapshots/6cd2e5e500f0c928b1e6fc63086d9eaf5867c8478fb31658bdd2857ea2eeab19/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/e21831a745773cd8e129b7c833b90d8e24128b5b8e0ae661e698397aae84848f/contract";
import startContract from "../../snapshots/e21831a745773cd8e129b7c833b90d8e24128b5b8e0ae661e698397aae84848f/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("isHidden", "bool", {
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
