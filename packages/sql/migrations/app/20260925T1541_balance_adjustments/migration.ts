#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/7d3cd303e002cc19fb1eca208fe0e84771c9b12863e59dbb89691231cf7f5a16/contract";
import startContract from "../../snapshots/7d3cd303e002cc19fb1eca208fe0e84771c9b12863e59dbb89691231cf7f5a16/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/97d55fc84368776ed927a05daa6b3b2e86ddb17af737bc2f2302b2e569ffbd36/contract";
import endContract from "../../snapshots/97d55fc84368776ed927a05daa6b3b2e86ddb17af737bc2f2302b2e569ffbd36/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("balance", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "BalanceAdjustment_pkey" })],
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.createIndex({
				columns: ["userId", "financialAccountId", "date"],
				extras: { unique: true },
				index: "BalanceAdjustment_userId_account_date_key",
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "BalanceAdjustment_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "BalanceAdjustment_financialAccountId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "BalanceAdjustment",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
