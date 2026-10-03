#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/0b65cd30af28a84c140bdbd4e2dc1648e2e5b18cc6ae78f08b06f0a3002e161e/contract";
import startContract from "../../snapshots/0b65cd30af28a84c140bdbd4e2dc1648e2e5b18cc6ae78f08b06f0a3002e161e/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/cefc24e812413f0dc86f6896aafa5b1e75287baca760266bf194f867c2421e96/contract";
import endContract from "../../snapshots/cefc24e812413f0dc86f6896aafa5b1e75287baca760266bf194f867c2421e96/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("paymentAccountId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "CreditCard",
			}),
			this.addColumn({
				column: col("paymentSuggestionsEnabled", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(true),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCard",
			}),
			this.addColumn({
				column: col("isPrimary", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.createIndex({
				columns: ["paymentAccountId"],
				index: "CreditCard_paymentAccountId_idx",
				schema: "public",
				table: "CreditCard",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["paymentAccountId"],
					name: "CreditCard_paymentAccountId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "CreditCard",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
