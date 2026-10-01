#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/6cd2e5e500f0c928b1e6fc63086d9eaf5867c8478fb31658bdd2857ea2eeab19/contract";
import startContract from "../../snapshots/6cd2e5e500f0c928b1e6fc63086d9eaf5867c8478fb31658bdd2857ea2eeab19/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/11f7200adb8f9fa981d3d0aab7b6e9c8c444c027f08f182ed0a956f99a387992/contract";
import endContract from "../../snapshots/11f7200adb8f9fa981d3d0aab7b6e9c8c444c027f08f182ed0a956f99a387992/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropConstraint({
				constraint: "CreditPurchaseRecord_subscriptionId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.dropConstraint({
				constraint: "DebtSplit_recurringPaymentId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "DebtSplit",
			}),
			this.dropConstraint({
				constraint: "Transaction_recurrenceId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "Transaction",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("dayOfMonth", "int2", { codecRef: { codecId: "pg/int2@1" } }),
					col("dayOfWeek", "int2", { codecRef: { codecId: "pg/int2@1" } }),
					col("destinationFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("interval", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(1),
						notNull: true,
					}),
					col("isActive", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("legacyId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("legacySource", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
					}),
					col("materializedThrough", "date", {
						codecRef: { codecId: "pg/date@1" },
						default: fn("(CURRENT_DATE - 1)"),
						notNull: true,
					}),
					col("movement", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("originFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("unit", "character varying(5)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 5 } },
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
				constraints: [primaryKey(["id"], { name: "Recurrence_pkey" })],
				schema: "public",
				table: "Recurrence",
			}),
			this.createTable({
				columns: [
					col("changedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("field", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("newValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("oldValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "RecurrenceHistory_pkey" })],
				schema: "public",
				table: "RecurrenceHistory",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("transactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["recurrenceId", "date"], { name: "RecurrenceOccurrence_pkey" })],
				schema: "public",
				table: "RecurrenceOccurrence",
			}),
			this.createIndex({
				columns: ["legacySource", "legacyId"],
				extras: { unique: true },
				index: "Recurrence_legacy_key",
				schema: "public",
				table: "Recurrence",
			}),
			this.createIndex({
				columns: ["userId", "isActive", "name", "id"],
				index: "Recurrence_user_active_name_idx",
				schema: "public",
				table: "Recurrence",
			}),
			this.createIndex({
				columns: ["recurrenceId", "changedAt", "id"],
				index: "RecurrenceHistory_recurrence_date_idx",
				schema: "public",
				table: "RecurrenceHistory",
			}),
			rawSql({
				execute: [
					{
						description: "recurrence.backfill",
						sql: readFileSync(new URL("./backfill.sql", import.meta.url), "utf8"),
					},
				],
				id: "recurrence.backfill",
				label: "Convert legacy schedules and preserve occurrence identities",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "Recurrence_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["originFinancialAccountId"],
					name: "Recurrence_origin_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["destinationFinancialAccountId"],
					name: "Recurrence_destination_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "Recurrence_card_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["subscriptionId"],
					name: "CreditPurchaseRecord_subscriptionId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurringPaymentId"],
					name: "DebtSplit_recurringPaymentId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "RecurrenceHistory_recurrence_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "RecurrenceHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "RecurrenceOccurrence_recurrence_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "RecurrenceOccurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "Transaction_recurrenceId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "Transaction",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
