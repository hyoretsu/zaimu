#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import postgresStatic from "@prisma/orm-postgres/static";
import type { Contract as Start } from "../../snapshots/cd78799f24930883e5fa4ba15ac1567e0152c27b2ef55617c947879248121da4/contract";
import startContract from "../../snapshots/cd78799f24930883e5fa4ba15ac1567e0152c27b2ef55617c947879248121da4/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/ed042713ddc4f0005c90402e05424ba3a4f9b987561fde83d7d3a158a7c87482/contract";
import endContract from "../../snapshots/ed042713ddc4f0005c90402e05424ba3a4f9b987561fde83d7d3a158a7c87482/contract.json" with {
	type: "json",
};

const db = postgresStatic<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("hasImportedAmount", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "CreditPurchase",
			}),
			this.dataTransform(endContract, "backfill-CreditPurchase-hasImportedAmount", {
				run: () =>
					db.raw.sql`
						UPDATE "public"."CreditPurchase"
						SET "hasImportedAmount" = true
						WHERE "externalId" IS NOT NULL
					`.affectedCount(),
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
