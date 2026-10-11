#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/c5c462322a1b1481675cffa01de1e1f19d479fae16d169afb8cbc62857bf3dac/contract";
import endContract from "../../snapshots/c5c462322a1b1481675cffa01de1e1f19d479fae16d169afb8cbc62857bf3dac/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract";
import startContract from "../../snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("creditInstallmentRemainderOnFirst", "bool", {
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
