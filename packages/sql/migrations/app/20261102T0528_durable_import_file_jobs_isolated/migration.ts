#!/usr/bin/env -S bun
import { col, fn, lit, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/1ce00365762f398d639512abcc6b130d22364beea5f36452debb2fdb137caa62/contract";
import startContract from "../../snapshots/1ce00365762f398d639512abcc6b130d22364beea5f36452debb2fdb137caa62/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/5f6b4cd90770cc8d161af5e9a6dec4e91e58593d2bb41e6abed6efc78ff6c2c7/contract";
import endContract from "../../snapshots/5f6b4cd90770cc8d161af5e9a6dec4e91e58593d2bb41e6abed6efc78ff6c2c7/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("batchId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("error", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("fileBytes", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("fileName", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("fileType", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("finishedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("ignoredCount", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("importId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("kind", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("ordinal", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
					col("password", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("provider", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("scopeId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("statementId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
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
				constraints: [primaryKey(["id"], { name: "ImportFileJob_pkey" })],
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createIndex({
				columns: ["userId", "batchId", "ordinal"],
				index: "ImportFileJob_batch_idx",
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createIndex({
				columns: ["status", "lockedUntil"],
				index: "ImportFileJob_recovery_idx",
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createIndex({
				columns: ["kind", "scopeId", "status", "createdAt"],
				index: "ImportFileJob_scope_idx",
				schema: "public",
				table: "ImportFileJob",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
