#!/usr/bin/env -S node
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/71ad72b2a31c3f1bb4d0b4bd77b04797020b43fb4d86959a92c45d4dc6b6e4c5/contract";
import endContract from "../../snapshots/71ad72b2a31c3f1bb4d0b4bd77b04797020b43fb4d86959a92c45d4dc6b6e4c5/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/e40ebc41b7b69021378d2fd198294aaeddcf6494bf266af9ebf034fe5bb5064b/contract";
import startContract from "../../snapshots/e40ebc41b7b69021378d2fd198294aaeddcf6494bf266af9ebf034fe5bb5064b/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createIndex({
				columns: ["completedAt", "kind", "availableAt", "lockedUntil"],
				index: "ReferenceRateJob_claim_idx",
				schema: "public",
				table: "ReferenceRateJob",
			}),
			rawSql({
				execute: [
					{
						description: "Repair reference settings, bootstrap jobs, and constraints",
						sql: `UPDATE "public"."FinancialAccount"
SET "yieldReferenceType" = 'CDI'
WHERE "yieldReferencePercentage" IS NOT NULL AND "yieldReferenceType" IS NULL;

UPDATE "public"."FinancialAccountYieldRateHistory"
SET "yieldReferenceType" = 'CDI'
WHERE "yieldReferencePercentage" IS NOT NULL AND "yieldReferenceType" IS NULL;

UPDATE "public"."FinancialInstitutionYieldRule"
SET "yieldReferenceType" = 'CDI'
WHERE "yieldReferencePercentage" IS NOT NULL AND "yieldReferenceType" IS NULL;

INSERT INTO "public"."ReferenceRateJob" ("kind", "deduplicationKey", "referenceType", "startDate", "endDate") VALUES
('FETCH_RATES', 'bootstrap:v2:CDI:2020-01-01:2026-09-17', 'CDI', DATE '2020-01-01', DATE '2026-09-17'),
('FETCH_RATES', 'bootstrap:v2:SELIC:2020-01-01:2026-09-17', 'SELIC', DATE '2020-01-01', DATE '2026-09-17')
ON CONFLICT ("deduplicationKey") DO NOTHING;

ALTER TABLE "public"."FinancialAccount" DROP CONSTRAINT IF EXISTS "FinancialAccount_yield_settings_check";
ALTER TABLE "public"."FinancialAccount" ADD CONSTRAINT "FinancialAccount_yield_settings_check" CHECK (("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldFixedRate" > 0) AND ("yieldReferencePercentage" IS NULL OR "yieldReferencePercentage" > 0) AND ("yieldFixedRate" IS NOT NULL OR "yieldReferenceType" IS NOT NULL OR "yieldPeriod" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldPeriod" IS NOT NULL));

ALTER TABLE "public"."FinancialAccountYieldRateHistory" DROP CONSTRAINT IF EXISTS "FinancialAccountYieldRateHistory_yield_settings_check";
ALTER TABLE "public"."FinancialAccountYieldRateHistory" ADD CONSTRAINT "FinancialAccountYieldRateHistory_yield_settings_check" CHECK (("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldFixedRate" > 0) AND ("yieldReferencePercentage" IS NULL OR "yieldReferencePercentage" > 0) AND ("yieldFixedRate" IS NOT NULL OR "yieldReferenceType" IS NOT NULL OR "yieldPeriod" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldPeriod" IS NOT NULL));

ALTER TABLE "public"."FinancialInstitutionYieldRule" DROP CONSTRAINT IF EXISTS "FinancialInstitutionYieldRule_yield_settings_check";
ALTER TABLE "public"."FinancialInstitutionYieldRule" ADD CONSTRAINT "FinancialInstitutionYieldRule_yield_settings_check" CHECK (("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL) AND ("yieldFixedRate" IS NULL OR "yieldFixedRate" > 0) AND ("yieldReferencePercentage" IS NULL OR "yieldReferencePercentage" > 0) AND ("yieldFixedRate" IS NOT NULL OR "yieldReferenceType" IS NOT NULL));

ALTER TABLE "public"."ReferenceRateJob" DROP CONSTRAINT IF EXISTS "ReferenceRateJob_payload_check";
ALTER TABLE "public"."ReferenceRateJob" ADD CONSTRAINT "ReferenceRateJob_payload_check" CHECK (("kind" = 'FETCH_RATES' AND "referenceType" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "financialAccountId" IS NULL AND "fromDate" IS NULL) OR ("kind" = 'RECALCULATE_ACCOUNT' AND "financialAccountId" IS NOT NULL AND "fromDate" IS NOT NULL AND "referenceType" IS NULL AND "startDate" IS NULL AND "endDate" IS NULL));`,
					},
				],
				id: "repairReferenceRateJobs.data",
				label: "Repair reference-rate data and queue invariants",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
