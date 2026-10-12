#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract";
import startContract from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/a92b1f7f1f3a857567384af7b56de1a1e8aec7e149dd069ab662f5b4e1263ac0/contract";
import endContract from "../../snapshots/a92b1f7f1f3a857567384af7b56de1a1e8aec7e149dd069ab662f5b4e1263ac0/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropIndex({
				index: "FinancialInstitutionYieldPolicy_institutionId_effectiveDate_key",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.dropColumn({ column: "name", schema: "public", table: "YieldCalendarCountry" }),
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
					col("payload", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("readAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("type", "character varying(40)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 40 } },
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
				table: "AppNotification",
			}),
			this.createTable({
				columns: [
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
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
					col("effectiveFrom", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("effectiveUntil", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("source", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						notNull: true,
					}),
					col("sourceVersion", "character varying(64)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
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
				table: "CurrencyCountryAssociation",
			}),
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
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("isDefault", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
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
				table: "FinancialInstitutionProfile",
			}),
			this.createTable({
				columns: [
					col("authorId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("baseVersion", "int4", { codecRef: { codecId: "pg/int4@1" } }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("effectiveDate", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("kind", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
						notNull: true,
					}),
					col("payload", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("reason", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("reviewedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("reviewerId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("PENDING"),
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
				table: "FinancialInstitutionProposal",
			}),
			this.createTable({
				columns: [
					col("action", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
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
					col("payload", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("proposalId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("reviewerId", "character varying(36)", {
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
				table: "InstitutionReviewAudit",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("globalRulesFrom", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
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
				table: "UserFinancialInstitution",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("effectiveDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("linkId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("profileId", "character varying(36)", {
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
				table: "UserInstitutionProfileChange",
			}),
			this.createTable({
				columns: [
					col("confirmedBy", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("generatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("source", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						notNull: true,
					}),
					col("sourceVersion", "character varying(64)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
						notNull: true,
					}),
					col("status", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("year", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
				],
				constraints: [primaryKey(["countryCode", "year"])],
				schema: "public",
				table: "YieldCalendarCoverage",
			}),
			this.createTable({
				columns: [
					col("action", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "YieldCalendarOverride",
			}),
			this.addColumn({
				column: col("countryCode", "character varying(2)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("legacyInstitutionId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("operatingCountryCodes", "character varying(2)[]", {
					codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 2 } },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addColumn({
				column: col("status", "character varying(24)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
					default: lit("LEGACY_PRIVATE"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addColumn({
				column: col("version", "int4", {
					codecRef: { codecId: "pg/int4@1" },
					default: lit(1),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addColumn({
				column: col("countryCode", "character varying(2)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("effectiveUntil", "date", { codecRef: { codecId: "pg/date@1" } }),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("profileId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("status", "character varying(16)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
					default: lit("APPROVED"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("effectiveFrom", "date", { codecRef: { codecId: "pg/date@1" } }),
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.addColumn({
				column: col("effectiveUntil", "date", { codecRef: { codecId: "pg/date@1" } }),
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.addColumn({
				column: col("source", "character varying(32)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
					default: lit("ADMIN"),
					notNull: true,
				}),
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.addColumn({
				column: col("sourceVersion", "character varying(64)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
				}),
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.addColumn({
				column: col("preferredCountry", "character varying(2)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
				}),
				schema: "public",
				table: "user",
			}),
			this.dropNotNull({ column: "userId", schema: "public", table: "FinancialInstitution" }),
			this.addCheckConstraint({
				constraint: "FinancialInstitution_operatingCountryCodes_elem_not_nu_49201499",
				expression: 'array_position("operatingCountryCodes", NULL) IS NULL',
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addUnique({
				columns: ["institutionId", "name"],
				constraint: "FinancialInstitutionProfile_institutionId_name_key",
				schema: "public",
				table: "FinancialInstitutionProfile",
			}),
			this.addUnique({
				columns: ["userId", "institutionId"],
				constraint: "UserFinancialInstitution_userId_institutionId_key",
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.addUnique({
				columns: ["linkId", "effectiveDate"],
				constraint: "UserInstitutionProfileChange_linkId_effectiveDate_key",
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addUnique({
				columns: ["countryCode", "date"],
				constraint: "YieldCalendarOverride_countryCode_date_key",
				schema: "public",
				table: "YieldCalendarOverride",
			}),
			this.createIndex({
				columns: ["userId", "readAt", "createdAt"],
				index: "AppNotification_userId_readAt_createdAt_idx_9b6c3810",
				schema: "public",
				table: "AppNotification",
			}),
			this.createIndex({
				columns: ["currency", "countryCode"],
				index: "CurrencyCountryAssociation_currency_countryCode_idx_c16d675b",
				schema: "public",
				table: "CurrencyCountryAssociation",
			}),
			this.createIndex({
				columns: ["authorId"],
				index: "FinancialInstitutionProposal_authorId_idx_e47547ed",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "FinancialInstitutionProposal_institutionId_idx_bab0e331",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["reviewerId"],
				index: "FinancialInstitutionProposal_reviewerId_idx_25a27b4e",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["status", "createdAt"],
				index: "FinancialInstitutionProposal_status_createdAt_idx_58610442",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["financialInstitutionId", "effectiveDate"],
				index: "FinancialInstitutionYieldPolicy_institutionId_effectiveDate_idx",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createIndex({
				columns: ["profileId", "countryCode", "currency", "effectiveDate"],
				index: "InstitutionPolicy_scope_date_idx",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createIndex({
				columns: ["proposalId"],
				index: "InstitutionReviewAudit_proposalId_idx_2f5df372",
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.createIndex({
				columns: ["reviewerId"],
				index: "InstitutionReviewAudit_reviewerId_idx_25a27b4e",
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "UserFinancialInstitution_institutionId_idx_bab0e331",
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.createIndex({
				columns: ["profileId"],
				index: "UserInstitutionProfileChange_profileId_idx_d9cdfcaf",
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "AppNotification_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "AppNotification",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "CurrencyCountryAssociation_countryCode_fkey",
					onDelete: "restrict",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "CurrencyCountryAssociation",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "FinancialInstitutionProfile_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "FinancialInstitutionProfile",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "FinancialInstitutionProposal_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["authorId"],
					name: "FinancialInstitutionProposal_authorId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reviewerId"],
					name: "FinancialInstitutionProposal_reviewerId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["profileId"],
					name: "FinancialInstitutionYieldPolicy_profileId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitutionProfile" },
				},
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["proposalId"],
					name: "InstitutionReviewAudit_proposalId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitutionProposal" },
				},
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reviewerId"],
					name: "InstitutionReviewAudit_reviewerId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "UserFinancialInstitution_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "UserFinancialInstitution_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["linkId"],
					name: "UserInstitutionProfileChange_linkId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "UserFinancialInstitution" },
				},
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["profileId"],
					name: "UserInstitutionProfileChange_profileId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitutionProfile" },
				},
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarCoverage_countryCode_fkey",
					onDelete: "restrict",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarCoverage",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarOverride_countryCode_fkey",
					onDelete: "restrict",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarOverride",
			}),
			rawSql({
				execute: [
					{
						description: "Backfill private links and preserve administrative calendars",
						sql: readFileSync(new URL("./backfill.sql", import.meta.url), "utf8"),
					},
				],
				id: "universalInstitutions.preserveLegacy",
				invariantId: "universalInstitutions.legacyPreserved.v1",
				label: "Preserve private institutions, profiles and administrator calendars",
				operationClass: "data",
				postcheck: [
					{
						description: "Every legacy institution has a default profile and private link",
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "FinancialInstitution" i WHERE i."userId" IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM "FinancialInstitutionProfile" p WHERE p."institutionId"=i."id" AND p."isDefault") OR NOT EXISTS (SELECT 1 FROM "UserFinancialInstitution" l WHERE l."institutionId"=i."id" AND l."userId"=i."userId"))) AS result`,
					},
				],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
