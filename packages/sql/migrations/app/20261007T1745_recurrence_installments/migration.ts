#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import postgresStatic from "@prisma/orm-postgres/static";
import type { Contract as End } from "../../snapshots/029c93a1fcdeb2607c647a09a43c3ee809ce86d785f50a71c707228e057ae380/contract";
import endContract from "../../snapshots/029c93a1fcdeb2607c647a09a43c3ee809ce86d785f50a71c707228e057ae380/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/e598837aec6b0359bd47c41caaff1643d4361b7b0dab398febf06e25f94e516c/contract";
import startContract from "../../snapshots/e598837aec6b0359bd47c41caaff1643d4361b7b0dab398febf06e25f94e516c/contract.json" with {
	type: "json",
};

const db = postgresStatic<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("installments", "int2", {
					codecRef: { codecId: "pg/int2@1" },
					default: lit(1),
					notNull: true,
				}),
				schema: "public",
				table: "Recurrence",
			}),
			this.dataTransform(endContract, "validate-Recurrence-installments", {
				run: () =>
					db.raw.sql`
          ALTER TABLE "public"."Recurrence"
          ADD CONSTRAINT "Recurrence_installments_check"
          CHECK ("installments" BETWEEN 1 AND 48 AND ("movement" = 'CARD_PURCHASE' OR "installments" = 1))
        `.affectedCount(),
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
