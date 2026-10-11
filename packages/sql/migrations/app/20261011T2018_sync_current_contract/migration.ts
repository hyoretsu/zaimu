#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract";
import endContract from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/52198e4524b2dce87ad5056a4ae46ab075a7a494e4cf6ca64dcf3a78ef3ac48c/contract";
import startContract from "../../snapshots/52198e4524b2dce87ad5056a4ae46ab075a7a494e4cf6ca64dcf3a78ef3ac48c/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropColumn({ column: "yieldTaxType", schema: "public", table: "FinancialAccount" }),
			this.dropColumn({
				column: "yieldTaxType",
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.dropColumn({
				column: "yieldTaxType",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createTable({
				columns: [
					col("code", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["code"])],
				schema: "public",
				table: "YieldCalendarCountry",
			}),
			this.createTable({
				columns: [
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["countryCode", "currency"])],
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.createTable({
				columns: [
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "YieldCalendarHoliday",
			}),
			this.createTable({
				columns: [
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("isActive", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "taxDefinition",
			}),
			this.createTable({
				columns: [
					col("applicationOrder", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
					col("brackets", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("effectiveDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("taxDefinitionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "taxDefinitionVersion",
			}),
			this.addColumn({
				column: col("yieldTaxIds", "character varying(36)[]", {
					codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("yieldTaxIds", "character varying(36)[]", {
					codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addColumn({
				column: col("yieldTaxIds", "character varying(36)[]", {
					codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("role", "character varying(10)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 10 } },
					default: lit("USER"),
					notNull: true,
				}),
				schema: "public",
				table: "user",
			}),
			this.addCheckConstraint({
				constraint: "FinancialAccount_yieldTaxIds_elem_not_null_6844033d",
				expression: 'array_position("yieldTaxIds", NULL) IS NULL',
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addCheckConstraint({
				constraint: "FinancialAccountYieldRateHistory_yieldTaxIds_elem_not__6844033d",
				expression: 'array_position("yieldTaxIds", NULL) IS NULL',
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addCheckConstraint({
				constraint: "FinancialInstitutionYieldPolicy_yieldTaxIds_elem_not_n_6844033d",
				expression: 'array_position("yieldTaxIds", NULL) IS NULL',
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addUnique({
				columns: ["taxDefinitionId", "effectiveDate"],
				constraint: "taxDefinitionVersion_taxDefinitionId_effectiveDate_key",
				schema: "public",
				table: "taxDefinitionVersion",
			}),
			this.createIndex({
				columns: ["currency"],
				index: "YieldCalendarCurrency_currency_idx_e37259ca",
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.createIndex({
				columns: ["countryCode", "date"],
				extras: { unique: true },
				index: "YieldCalendarHoliday_countryCode_date_idx_dc368468",
				schema: "public",
				table: "YieldCalendarHoliday",
			}),
			this.createIndex({
				columns: ["taxDefinitionId"],
				index: "taxDefinitionVersion_taxDefinitionId_idx_987c13b3",
				schema: "public",
				table: "taxDefinitionVersion",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarCurrency_countryCode_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarHoliday_countryCode_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarHoliday",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["taxDefinitionId"],
					name: "taxDefinitionVersion_taxDefinitionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "taxDefinition" },
				},
				schema: "public",
				table: "taxDefinitionVersion",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
