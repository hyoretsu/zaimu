#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/759f786ef657d499f89b54897bb28412cd3600c0dea895f55564031fe8ab02de/contract";
import endContract from "../../snapshots/759f786ef657d499f89b54897bb28412cd3600c0dea895f55564031fe8ab02de/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/d23d23fe0e77b392dc3262eaf9abb5d28367c17482dc9eb66c550389887e3a76/contract";
import startContract from "../../snapshots/d23d23fe0e77b392dc3262eaf9abb5d28367c17482dc9eb66c550389887e3a76/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				members: ["SYSTEM", "USER"],
				schema: "public",
				typeName: "FinancialAccountYieldOrigin",
			}),
			this.createNativeEnumType({
				members: ["FETCH_RATES", "RECALCULATE_ACCOUNT"],
				schema: "public",
				typeName: "ReferenceRateJobKind",
			}),
			this.createNativeEnumType({
				members: ["CDI", "SELIC"],
				schema: "public",
				typeName: "ReferenceRateType",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("type", '"ReferenceRateType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("value", "numeric(12,8)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 8 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "ReferenceRate_pkey" })],
				schema: "public",
				table: "ReferenceRate",
			}),
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("availableAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("completedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(240)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 240 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("fromDate", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("kind", '"ReferenceRateJobKind"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateJobKind" } },
						notNull: true,
					}),
					col("lastError", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("referenceType", '"ReferenceRateType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "ReferenceRateJob_pkey" })],
				schema: "public",
				table: "ReferenceRateJob",
			}),
			this.addColumn({
				column: col("yieldReferenceType", '"ReferenceRateType"', {
					codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("origin", '"FinancialAccountYieldOrigin"', {
					codecRef: {
						codecId: "pg/enum@1",
						typeParams: { typeName: "FinancialAccountYieldOrigin" },
					},
					default: lit("USER"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.addColumn({
				column: col("yieldReferenceType", '"ReferenceRateType"', {
					codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
				}),
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addColumn({
				column: col("yieldReferenceType", '"ReferenceRateType"', {
					codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
				}),
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
			rawSql({
				execute: [
					{
						description: "Convert reference settings, seed bootstrap jobs and enforce invariants",
						sql: `UPDATE "public"."FinancialAccount" SET "yieldReferenceType" = 'CDI' WHERE "yieldReferenceRate" IS NOT NULL;
UPDATE "public"."FinancialAccountYieldRateHistory" SET "yieldReferenceType" = 'CDI' WHERE "yieldReferenceRate" IS NOT NULL;
UPDATE "public"."FinancialInstitutionYieldRule" SET "yieldReferenceType" = 'CDI' WHERE "yieldReferenceRate" IS NOT NULL;
INSERT INTO "public"."ReferenceRateJob" ("kind", "deduplicationKey", "referenceType", "startDate", "endDate") VALUES
('FETCH_RATES', 'bootstrap:CDI:2020-01-01:2026-09-17', 'CDI', DATE '2020-01-01', DATE '2026-09-17'),
('FETCH_RATES', 'bootstrap:SELIC:2020-01-01:2026-09-17', 'SELIC', DATE '2020-01-01', DATE '2026-09-17');
ALTER TABLE "public"."FinancialAccount" DROP CONSTRAINT IF EXISTS "FinancialAccount_yield_settings_check";
ALTER TABLE "public"."FinancialAccountYieldRateHistory" DROP CONSTRAINT IF EXISTS "FinancialAccountYieldRateHistory_yield_settings_check";
ALTER TABLE "public"."FinancialInstitutionYieldRule" DROP CONSTRAINT IF EXISTS "FinancialInstitutionYieldRule_yield_settings_check";`,
					},
				],
				id: "referenceRateYields.backfill",
				label: "Convert references to CDI and seed bootstrap jobs",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.dropColumn({ column: "yieldReferenceRate", schema: "public", table: "FinancialAccount" }),
			this.dropColumn({
				column: "yieldReferenceRate",
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.dropColumn({
				column: "yieldReferenceRate",
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
			rawSql({
				execute: [
					{
						description: "Enforce reference settings and queue payloads",
						sql: `ALTER TABLE "public"."FinancialAccount" ADD CONSTRAINT "FinancialAccount_yield_settings_check" CHECK (("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldFixedRate" > 0) AND ("yieldReferencePercentage" IS NULL OR "yieldReferencePercentage" > 0) AND ("yieldFixedRate" IS NOT NULL OR "yieldReferenceType" IS NOT NULL OR "yieldPeriod" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldPeriod" IS NOT NULL));
ALTER TABLE "public"."FinancialAccountYieldRateHistory" ADD CONSTRAINT "FinancialAccountYieldRateHistory_yield_settings_check" CHECK (("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldFixedRate" > 0) AND ("yieldReferencePercentage" IS NULL OR "yieldReferencePercentage" > 0) AND ("yieldFixedRate" IS NOT NULL OR "yieldReferenceType" IS NOT NULL OR "yieldPeriod" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldPeriod" IS NOT NULL));
ALTER TABLE "public"."FinancialInstitutionYieldRule" ADD CONSTRAINT "FinancialInstitutionYieldRule_yield_settings_check" CHECK (("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldFixedRate" > 0) AND ("yieldReferencePercentage" IS NULL OR "yieldReferencePercentage" > 0) AND ("yieldFixedRate" IS NOT NULL OR "yieldReferenceType" IS NOT NULL));
ALTER TABLE "public"."ReferenceRateJob" ADD CONSTRAINT "ReferenceRateJob_payload_check" CHECK (("kind" = 'FETCH_RATES' AND "referenceType" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "financialAccountId" IS NULL AND "fromDate" IS NULL) OR ("kind" = 'RECALCULATE_ACCOUNT' AND "financialAccountId" IS NOT NULL AND "fromDate" IS NOT NULL AND "referenceType" IS NULL AND "startDate" IS NULL AND "endDate" IS NULL));`,
					},
				],
				id: "referenceRateYields.constraints",
				label: "Enforce reference yield and queue invariants",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.createIndex({
				columns: ["type", "date"],
				extras: { unique: true },
				index: "ReferenceRate_type_date_key",
				schema: "public",
				table: "ReferenceRate",
			}),
			this.createIndex({
				columns: ["availableAt", "lockedUntil"],
				index: "ReferenceRateJob_availableAt_lockedUntil_idx",
				schema: "public",
				table: "ReferenceRateJob",
			}),
			this.createIndex({
				columns: ["deduplicationKey"],
				extras: { unique: true },
				index: "ReferenceRateJob_deduplicationKey_key",
				schema: "public",
				table: "ReferenceRateJob",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
