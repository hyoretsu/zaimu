#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/0b65cd30af28a84c140bdbd4e2dc1648e2e5b18cc6ae78f08b06f0a3002e161e/contract";
import endContract from "../../snapshots/0b65cd30af28a84c140bdbd4e2dc1648e2e5b18cc6ae78f08b06f0a3002e161e/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf/contract";
import startContract from "../../snapshots/489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: "public",
				typeName: "CreditCardImportProvider",
				value: "MEUPLUGGY",
			}),
			this.addNativeEnumValue({
				schema: "public",
				typeName: "TransactionImportProvider",
				value: "MEUPLUGGY",
			}),
			this.dropConstraint({
				constraint: "CreditCardImportItem_reconciledCreditPurchaseId_key",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createTable({
				columns: [
					col("connectionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("paused", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("remoteAccountId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceBinding_pkey" })],
				schema: "public",
				table: "OpenFinanceBinding",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("encryptedCredentials", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("lastQueriedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
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
				constraints: [primaryKey(["userId"], { name: "OpenFinanceConfig_pkey" })],
				schema: "public",
				table: "OpenFinanceConfig",
			}),
			this.createTable({
				columns: [
					col("bankName", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("bankUpdatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
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
					col("itemId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("remoteAccounts", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("status", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceConnection_pkey" })],
				schema: "public",
				table: "OpenFinanceConnection",
			}),
			this.createTable({
				columns: [
					col("externalId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("recordId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("remoteAccountId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [
					primaryKey(["userId", "remoteAccountId", "externalId"], {
						name: "OpenFinanceIdentity_pkey",
					}),
				],
				schema: "public",
				table: "OpenFinanceIdentity",
			}),
			this.createTable({
				columns: [
					col("appliedSnapshot", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("identity", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("importId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("localId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("localKind", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("remoteAccountId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("reviewItemId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("snapshot", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("state", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
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
				constraints: [primaryKey(["id"], { name: "OpenFinanceRecord_pkey" })],
				schema: "public",
				table: "OpenFinanceRecord",
			}),
			this.createTable({
				columns: [
					col("errors", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: lit("[]"),
						notNull: true,
					}),
					col("finishedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("imported", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("linked", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("pending", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("processed", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("startedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("status", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("workerToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceRun_pkey" })],
				schema: "public",
				table: "OpenFinanceRun",
			}),
			this.addColumn({
				column: col("metadataMissing", "json", {
					codecRef: { codecId: "pg/json@1" },
					default: lit("[]"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createIndex({
				columns: ["connectionId", "remoteAccountId"],
				extras: { unique: true },
				index: "OpenFinanceBinding_connection_account_key",
				schema: "public",
				table: "OpenFinanceBinding",
			}),
			this.createIndex({
				columns: ["userId", "itemId"],
				extras: { unique: true },
				index: "OpenFinanceConnection_user_item_key",
				schema: "public",
				table: "OpenFinanceConnection",
			}),
			this.createIndex({
				columns: ["userId", "remoteAccountId", "identity"],
				extras: { unique: true },
				index: "OpenFinanceRecord_identity_key",
				schema: "public",
				table: "OpenFinanceRecord",
			}),
			this.createIndex({
				columns: ["userId", "startedAt"],
				index: "OpenFinanceRun_user_started_idx",
				schema: "public",
				table: "OpenFinanceRun",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["connectionId"],
					name: "OpenFinanceBinding_connectionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "OpenFinanceConnection" },
				},
				schema: "public",
				table: "OpenFinanceBinding",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceConfig_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceConfig",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceConnection_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceConnection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recordId"],
					name: "OpenFinanceIdentity_recordId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "OpenFinanceRecord" },
				},
				schema: "public",
				table: "OpenFinanceIdentity",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceRecord_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceRun_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceRun",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
