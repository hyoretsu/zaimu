#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/3a45141167703c5632f10ac450de0f5dc9cbf23ae553d9460d2d32d8d8a64cc9/contract";
import endContract from "../../snapshots/3a45141167703c5632f10ac450de0f5dc9cbf23ae553d9460d2d32d8d8a64cc9/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/70221dab7e68b3dadba6f2c94b9d28480c606d93906f1b746543c3976f7420bc/contract";
import startContract from "../../snapshots/70221dab7e68b3dadba6f2c94b9d28480c606d93906f1b746543c3976f7420bc/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				members: ["MERCADO_PAGO"],
				schema: "public",
				typeName: "CreditCardImportProvider",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("dueDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("fileName", "character varying(255)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 255 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("provider", '"CreditCardImportProvider"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "CreditCardImportProvider" },
						},
						notNull: true,
					}),
					col("statementDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("status", '"TransactionImportStatus"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "TransactionImportStatus" },
						},
						default: lit("PENDING"),
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
				constraints: [primaryKey(["id"], { name: "CreditCardImport_pkey" })],
				schema: "public",
				table: "CreditCardImport",
			}),
			this.createTable({
				columns: [
					col("categoryId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("creditCardImportId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("currentInstallment", "int2", {
						codecRef: { codecId: "pg/int2@1" },
						default: lit(1),
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("installmentAmount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("installments", "int2", {
						codecRef: { codecId: "pg/int2@1" },
						default: lit(1),
						notNull: true,
					}),
					col("isSelected", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("purchaseDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("totalAmount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditCardImportItem_pkey" })],
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addColumn({
				column: col("externalId", "character varying(200)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
				}),
				schema: "public",
				table: "CreditPurchase",
			}),
			this.createIndex({
				columns: ["creditCardId"],
				index: "CreditCardImport_creditCardId_idx",
				schema: "public",
				table: "CreditCardImport",
			}),
			this.createIndex({
				columns: ["userId", "status", "createdAt"],
				index: "CreditCardImport_userId_status_createdAt_idx",
				schema: "public",
				table: "CreditCardImport",
			}),
			this.createIndex({
				columns: ["externalId"],
				index: "CreditCardImportItem_externalId_idx",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createIndex({
				columns: ["creditCardImportId", "purchaseDate"],
				index: "CreditCardImportItem_importId_purchaseDate_idx",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createIndex({
				columns: ["externalId"],
				extras: { unique: true },
				index: "CreditPurchase_externalId_key",
				schema: "public",
				table: "CreditPurchase",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "CreditCardImport_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditCardImport",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditCardImport_creditCardId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditCardImport",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardImportId"],
					name: "CreditCardImportItem_importId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardImport" },
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["categoryId"],
					name: "CreditCardImportItem_categoryId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Category" },
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
