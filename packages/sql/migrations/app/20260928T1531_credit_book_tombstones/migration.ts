#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/99eed01c4d9e431eb6a398664c2c9fb75f8fb90ecb7a8434ad623361534378e7/contract";
import startContract from "../../snapshots/99eed01c4d9e431eb6a398664c2c9fb75f8fb90ecb7a8434ad623361534378e7/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e21831a745773cd8e129b7c833b90d8e24128b5b8e0ae661e698397aae84848f/contract";
import endContract from "../../snapshots/e21831a745773cd8e129b7c833b90d8e24128b5b8e0ae661e698397aae84848f/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("entryKind", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditBookTombstone_pkey" })],
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.createIndex({
				columns: ["creditCardId"],
				index: "CreditBookTombstone_creditCardId_idx",
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "CreditBookTombstone_userId_idx",
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "CreditBookTombstone_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditBookTombstone_creditCardId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditBookTombstone",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
