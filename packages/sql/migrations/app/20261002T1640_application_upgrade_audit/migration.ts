#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { col, fn, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/b4328c2e5326cafd71f37360fd24ab0693c2cda1659dbd592cbe0c35408bbeae/contract";
import endContract from "../../snapshots/b4328c2e5326cafd71f37360fd24ab0693c2cda1659dbd592cbe0c35408bbeae/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/f455efbeae9a441e883befa794486f417ce17c903acc3e5fe483c941ed82879d/contract";
import startContract from "../../snapshots/f455efbeae9a441e883befa794486f417ce17c903acc3e5fe483c941ed82879d/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("archivedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("original", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("recordId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("source", "character varying(80)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 80 } },
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["source", "recordId"], { name: "ApplicationUpgradeArchive_pkey" })],
				schema: "public",
				table: "ApplicationUpgradeArchive",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("legacyId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("source", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
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
				constraints: [
					primaryKey(["userId", "source", "legacyId"], {
						name: "ApplicationUpgradeRecurrence_pkey",
					}),
				],
				schema: "public",
				table: "ApplicationUpgradeRecurrence",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "ApplicationUpgradeArchive_user_idx",
				schema: "public",
				table: "ApplicationUpgradeArchive",
			}),
			this.createIndex({
				columns: ["recurrenceId"],
				index: "ApplicationUpgradeRecurrence_destination_idx",
				schema: "public",
				table: "ApplicationUpgradeRecurrence",
			}),
			rawSql({
				execute: [
					{
						description: "Preserve evidence before legacy removal",
						sql: readFileSync(new URL("./backfill.sql", import.meta.url), "utf8"),
					},
				],
				id: "applicationUpgrade.audit",
				label: "Archive legacy evidence and preserve recurrence upgrade identities",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
