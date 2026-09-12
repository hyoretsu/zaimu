#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/3a45141167703c5632f10ac450de0f5dc9cbf23ae553d9460d2d32d8d8a64cc9/contract";
import startContract from "../../snapshots/3a45141167703c5632f10ac450de0f5dc9cbf23ae553d9460d2d32d8d8a64cc9/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/744a8b6e91fe1fceb7f2a49c9a168f13b4a1f5eebab349acdc41172b83e8f75e/contract";
import endContract from "../../snapshots/744a8b6e91fe1fceb7f2a49c9a168f13b4a1f5eebab349acdc41172b83e8f75e/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("reconciledCreditPurchaseId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addColumn({
				column: col("time", "time(3)", {
					codecRef: { codecId: "pg/time@1", typeParams: { precision: 3 } },
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addColumn({
				column: col("creditCardImportItemId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "DebtSplit",
			}),
			this.addUnique({
				columns: ["reconciledCreditPurchaseId"],
				constraint: "CreditCardImportItem_reconciledCreditPurchaseId_key",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addUnique({
				columns: ["creditCardImportItemId"],
				constraint: "DebtSplit_creditCardImportItemId_key",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reconciledCreditPurchaseId"],
					name: "CreditCardImportItem_reconciledCreditPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchase" },
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardImportItemId"],
					name: "DebtSplit_creditCardImportItemId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardImportItem" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
