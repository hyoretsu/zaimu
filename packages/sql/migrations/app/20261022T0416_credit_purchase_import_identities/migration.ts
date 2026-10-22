#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/47dfd2cc3f102e59fd3d5eb8789ff33245bb6bf56b83a628de086e2f5d6eff79/contract";
import startContract from "../../snapshots/47dfd2cc3f102e59fd3d5eb8789ff33245bb6bf56b83a628de086e2f5d6eff79/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/67361220fdee9916e7d6c4fa81a5e2b11c225fd8b960860a9e25e08b841ba440/contract";
import endContract from "../../snapshots/67361220fdee9916e7d6c4fa81a5e2b11c225fd8b960860a9e25e08b841ba440/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["externalId"], { name: "CreditPurchaseImportIdentity_pkey" })],
				schema: "public",
				table: "CreditPurchaseImportIdentity",
			}),
			this.createIndex({
				columns: ["purchaseId"],
				index: "CreditPurchaseImportIdentity_purchaseId_idx",
				schema: "public",
				table: "CreditPurchaseImportIdentity",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditPurchaseImportIdentity_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditPurchaseImportIdentity",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
