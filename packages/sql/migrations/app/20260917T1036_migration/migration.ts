#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/9c8075d9409735492c38278eb8c9a2d855797d4b05bbe2996411573ebb186cfc/contract";
import endContract from "../../snapshots/9c8075d9409735492c38278eb8c9a2d855797d4b05bbe2996411573ebb186cfc/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/ed042713ddc4f0005c90402e05424ba3a4f9b987561fde83d7d3a158a7c87482/contract";
import startContract from "../../snapshots/ed042713ddc4f0005c90402e05424ba3a4f9b987561fde83d7d3a158a7c87482/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("isFullySynced", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardStatement",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
