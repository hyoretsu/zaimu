#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/b4da9448c1f0b792deb9ebb08526b9deb09a9a5fb51c3cf9a1691391e49137e0/contract";
import endContract from "../../snapshots/b4da9448c1f0b792deb9ebb08526b9deb09a9a5fb51c3cf9a1691391e49137e0/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/fcc9506ccbe08176bc9aea5feddaf30f8a7f51ca1f6df7624568a8d9311c403d/contract";
import startContract from "../../snapshots/fcc9506ccbe08176bc9aea5feddaf30f8a7f51ca1f6df7624568a8d9311c403d/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("deletedAt", "timestamp(3)", {
					codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
				}),
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addColumn({
				column: col("isSettled", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "CreditStatementCharge",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
