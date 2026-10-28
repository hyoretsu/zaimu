#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/552955a95e9b3a8b209ee7186c907b49c4728200ae1952036d3f40f269436dce/contract";
import endContract from "../../snapshots/552955a95e9b3a8b209ee7186c907b49c4728200ae1952036d3f40f269436dce/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/e62659443b204cad0a50646e6e1e1ff44b659d6ed4ee5ee36f7da9633e32cdad/contract";
import startContract from "../../snapshots/e62659443b204cad0a50646e6e1e1ff44b659d6ed4ee5ee36f7da9633e32cdad/contract.json" with { type: "json" };

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
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("recipientId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("respondedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("senderId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("summary", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "AccountTransfer",
			}),
			this.createTable({
				columns: [
					col("accountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("transferId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("entityId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("entityType", "character varying(40)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 40 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("kind", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
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
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,8)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 8 } },
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
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("yieldPeriod", "character varying(8)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 8 } },
					}),
					col("yieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferenceRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "DetachedRewardCredit",
			}),
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("channel", "character varying(12)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 12 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("destinationKey", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("deviceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("event", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("lastError", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
					}),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("nextAttemptAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("transferId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
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
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.createTable({
				columns: [
					col("address", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("credentials", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("enabled", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("platform", "character varying(12)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 12 } },
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
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "PushDevice",
			}),
			this.addColumn({
				column: col("transferredProfileContext", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addUnique({
				columns: ["transferId", "accountId"],
				constraint: "AccountTransferItem_transferId_accountId_key",
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.addUnique({
				columns: ["entityType", "entityId"],
				constraint: "DetachedFinancialRecord_entityType_entityId_key",
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.addUnique({
				columns: ["transferId", "event", "destinationKey"],
				constraint: "NotificationDelivery_transferId_event_destinationKey_key",
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.addUnique({
				columns: ["address"],
				constraint: "PushDevice_address_key",
				schema: "public",
				table: "PushDevice",
			}),
			this.createIndex({
				columns: ["recipientId", "status", "createdAt"],
				index: "AccountTransfer_recipientId_status_createdAt_idx_163556a6",
				schema: "public",
				table: "AccountTransfer",
			}),
			this.createIndex({
				columns: ["senderId", "status", "createdAt"],
				index: "AccountTransfer_senderId_status_createdAt_idx_1751b28b",
				schema: "public",
				table: "AccountTransfer",
			}),
			this.createIndex({
				columns: ["accountId"],
				index: "AccountTransferItem_accountId_idx_cbfb3085",
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "DetachedFinancialRecord_userId_idx_a489d58a",
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.createIndex({
				columns: ["financialAccountId", "date"],
				index: "DetachedRewardCredit_financialAccountId_date_idx_de4be8dd",
				schema: "public",
				table: "DetachedRewardCredit",
			}),
			this.createIndex({
				columns: ["status", "nextAttemptAt"],
				index: "NotificationDelivery_status_nextAttemptAt_idx_8ba20615",
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "NotificationDelivery_userId_idx_a489d58a",
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.createIndex({
				columns: ["userId", "enabled"],
				index: "PushDevice_userId_enabled_idx_9da2f9d3",
				schema: "public",
				table: "PushDevice",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["senderId"],
					name: "AccountTransfer_senderId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "AccountTransfer",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recipientId"],
					name: "AccountTransfer_recipientId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "AccountTransfer",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transferId"],
					name: "AccountTransferItem_transferId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "AccountTransfer" },
				},
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DetachedFinancialRecord_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "DetachedRewardCredit_financialAccountId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "DetachedRewardCredit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "NotificationDelivery_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transferId"],
					name: "NotificationDelivery_transferId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "AccountTransfer" },
				},
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "PushDevice_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "PushDevice",
			}),
			rawSql({
				execute: [
					{
						description: "Install ownership guards",
						sql: readFileSync(
							new URL("../../../scripts/account-transfer-guards.sql", import.meta.url),
							"utf8",
						),
					},
				],
				id: "accountTransfers.ownershipGuards",
				label: "Enforce transfer ownership and detached history",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
