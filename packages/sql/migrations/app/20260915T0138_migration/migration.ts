#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/164c73ac7cc3d77564145f0db358bb3eaec0f1a05d13ec64497355e231e9e87a/contract";
import startContract from "../../snapshots/164c73ac7cc3d77564145f0db358bb3eaec0f1a05d13ec64497355e231e9e87a/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/cd78799f24930883e5fa4ba15ac1567e0152c27b2ef55617c947879248121da4/contract";
import endContract from "../../snapshots/cd78799f24930883e5fa4ba15ac1567e0152c27b2ef55617c947879248121da4/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("remainderDebtPersonId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "DebtSplit",
			}),
			this.createIndex({
				columns: ["remainderDebtPersonId"],
				index: "DebtSplit_remainderDebtPersonId_idx",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["remainderDebtPersonId"],
					name: "DebtSplit_remainderDebtPersonId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtPerson" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
