#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/09a0ed2c043a8a801fde68e2ed31cf0a91d354dcc805f5a24a172c08d14eb613/contract";
import startContract from "../../snapshots/09a0ed2c043a8a801fde68e2ed31cf0a91d354dcc805f5a24a172c08d14eb613/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/164c73ac7cc3d77564145f0db358bb3eaec0f1a05d13ec64497355e231e9e87a/contract";
import endContract from "../../snapshots/164c73ac7cc3d77564145f0db358bb3eaec0f1a05d13ec64497355e231e9e87a/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("description", "character varying(1000)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
				}),
				schema: "public",
				table: "DebtSplitParticipant",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
