#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/4b738b2f5203071c97a45b5be12d9d64c20af7c187530a08ae5d6c311585e620/contract";
import endContract from "../../snapshots/4b738b2f5203071c97a45b5be12d9d64c20af7c187530a08ae5d6c311585e620/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e/contract";
import startContract from "../../snapshots/0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("categoryId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("endMonth", "character varying(7)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 7 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("source", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("startMonth", "character varying(7)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 7 } },
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
				constraints: [primaryKey(["id"], { name: "MonthlyBudget_pkey" })],
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createIndex({
				columns: ["categoryId"],
				index: "MonthlyBudget_categoryId_idx",
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createIndex({
				columns: ["userId", "startMonth"],
				index: "MonthlyBudget_userId_startMonth_idx",
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "MonthlyBudget_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["categoryId"],
					name: "MonthlyBudget_categoryId_fkey",
					onDelete: "restrict",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Category" },
				},
				schema: "public",
				table: "MonthlyBudget",
			}),
			rawSql({
				execute: [
					{
						description: "Validate monthly budget values",
						sql: 'ALTER TABLE "public"."MonthlyBudget" ADD CONSTRAINT "MonthlyBudget_values_check" CHECK ("amount">0 AND length(trim("name"))>0 AND "currency" ~ \'^[A-Z]{3}$\' AND "source" IN (\'TAG\',\'STATEMENTS\',\'CUSTOM\') AND (("source"=\'TAG\')=("categoryId" IS NOT NULL)) AND "startMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND ("endMonth" IS NULL OR ("endMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND "endMonth">="startMonth")))',
					},
				],
				id: "monthlyBudget.values",
				invariantId: "monthlyBudget.values.v1",
				label: "Enforce monthly budget validity",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
