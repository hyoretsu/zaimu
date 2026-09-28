#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/b4da9448c1f0b792deb9ebb08526b9deb09a9a5fb51c3cf9a1691391e49137e0/contract";
import startContract from "../../snapshots/b4da9448c1f0b792deb9ebb08526b9deb09a9a5fb51c3cf9a1691391e49137e0/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/c85f8f1f993bf14eb7dca699c172a516292a539673d966ee74d9f7a5beaae778/contract";
import endContract from "../../snapshots/c85f8f1f993bf14eb7dca699c172a516292a539673d966ee74d9f7a5beaae778/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("chargeId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
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
					col("installmentId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("original", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("refundId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("requiresRefundReview", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditPurchaseLegacyEntry_pkey" })],
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addUnique({
				columns: ["chargeId"],
				constraint: "CreditPurchaseLegacyEntry_chargeId_key",
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addUnique({
				columns: ["installmentId"],
				constraint: "CreditPurchaseLegacyEntry_installmentId_key",
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addUnique({
				columns: ["refundId"],
				constraint: "CreditPurchaseLegacyEntry_refundId_key",
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.createIndex({
				columns: ["purchaseId"],
				index: "CreditPurchaseLegacyEntry_purchaseId_idx",
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditPurchaseLegacyEntry_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["installmentId"],
					name: "CreditPurchaseLegacyEntry_installmentId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditInstallmentRecord" },
				},
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["refundId"],
					name: "CreditPurchaseLegacyEntry_refundId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditRefundRecord" },
				},
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["chargeId"],
					name: "CreditPurchaseLegacyEntry_chargeId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditStatementCharge" },
				},
				schema: "public",
				table: "CreditPurchaseLegacyEntry",
			}),
			rawSql({
				execute: [
					{
						description: "Transactional normalized credit purchase backfill",
						sql: `-- Run with the schema migration, before enabling normalized writes. All-or-nothing.
LOCK TABLE "CreditPurchase" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "CreditPurchaseRecord", "CreditInstallmentPlan", "CreditInstallmentRecord",
 "CreditRefundRecord", "CreditStatementCharge", "CreditPurchaseLegacyEntry" IN ACCESS EXCLUSIVE MODE;

DO $backfill$
BEGIN
 IF EXISTS (SELECT 1 FROM "CreditPurchaseRecord")
  OR EXISTS (SELECT 1 FROM "CreditInstallmentRecord")
  OR EXISTS (SELECT 1 FROM "CreditRefundRecord")
  OR EXISTS (SELECT 1 FROM "CreditStatementCharge")
  OR EXISTS (SELECT 1 FROM "CreditPurchaseLegacyEntry") THEN
  RAISE EXCEPTION 'Normalized credit storage must be empty before backfill';
 END IF;
 IF EXISTS (
  SELECT 1 FROM "CreditPurchase" p
  JOIN "CreditCardStatement" s ON s."id" = p."statementId"
  JOIN "CreditCard" c ON c."id" = s."creditCardId"
  JOIN "FinancialAccount" a ON a."id" = c."financialAccountId"
  LEFT JOIN "CreditPurchase" root ON root."id" = p."parentId"
  LEFT JOIN "CreditCardStatement" rs ON rs."id" = root."statementId"
  WHERE p."userId" <> a."userId"
   OR (p."parentId" IS NOT NULL AND (root."id" IS NULL OR root."parentId" IS NOT NULL
    OR root."isRefund" OR p."isRefund" OR root."userId" <> p."userId"
    OR rs."creditCardId" <> s."creditCardId" OR root."isStatementCharge" <> p."isStatementCharge"))
   OR (NOT p."isRefund" AND (p."totalAmount" <= 0 OR p."installmentAmount" <= 0))
   OR (p."isRefund" AND (p."totalAmount" >= 0 OR p."installmentAmount" <> p."totalAmount"
    OR p."installments" <> 1 OR p."currentInstallment" <> 1))
 ) THEN RAISE EXCEPTION 'Invalid legacy purchase ownership, parent or amount - review required'; END IF;
 IF EXISTS (
  SELECT 1 FROM "CreditPurchase" p JOIN "CreditPurchase" root ON root."id" = COALESCE(p."parentId", p."id")
  WHERE NOT p."isRefund" AND NOT root."isStatementCharge"
   AND (root."installments" NOT BETWEEN 1 AND 48
    OR p."currentInstallment" NOT BETWEEN 1 AND root."installments")
 ) OR EXISTS (
  SELECT 1 FROM "CreditPurchase" p WHERE NOT p."isRefund" AND NOT p."isStatementCharge"
  GROUP BY COALESCE(p."parentId", p."id"), p."currentInstallment" HAVING COUNT(*) > 1
 ) THEN RAISE EXCEPTION 'Invalid or duplicate legacy installment - review required'; END IF;
 IF EXISTS (
  SELECT 1 FROM "CreditPurchase" root JOIN "CreditPurchase" p ON COALESCE(p."parentId", p."id") = root."id"
  WHERE root."parentId" IS NULL AND NOT root."isRefund" AND NOT root."isStatementCharge"
  GROUP BY root."id", root."totalAmount", root."installments"
  HAVING (root."totalAmount" - SUM(p."installmentAmount")) * 100 < root."installments" - COUNT(*)
   OR (root."installments" = COUNT(*) AND root."totalAmount" <> SUM(p."installmentAmount"))
 ) THEN RAISE EXCEPTION 'Legacy purchase total does not fit historical installments - review required'; END IF;
 IF EXISTS (
  SELECT 1 FROM "CreditPurchase" r JOIN "CreditPurchase" source ON source."id" = r."refundOfPurchaseId"
  JOIN "CreditPurchase" root ON root."id" = COALESCE(source."parentId", source."id")
  JOIN "CreditCardStatement" rs ON rs."id" = r."statementId"
  JOIN "CreditCardStatement" ps ON ps."id" = root."statementId"
  WHERE r."isRefund" AND (rs."creditCardId" <> ps."creditCardId" OR r."userId" <> root."userId")
 ) THEN RAISE EXCEPTION 'Legacy refund belongs to another owner or card - review required'; END IF;
 IF EXISTS (
  SELECT 1 FROM "CreditPurchase" r JOIN "CreditPurchase" source ON source."id" = r."refundOfPurchaseId"
  JOIN "CreditPurchase" root ON root."id" = COALESCE(source."parentId", source."id")
  WHERE r."isRefund" AND NOT root."isRefund" AND NOT root."isStatementCharge"
  GROUP BY root."id", root."totalAmount" HAVING SUM(ABS(r."totalAmount")) > root."totalAmount"
 ) THEN RAISE EXCEPTION 'Legacy refunds exceed purchase total - review required'; END IF;
 IF EXISTS (
  SELECT 1 FROM "CreditPurchase" p JOIN "CreditPurchase" settled ON settled."id" = p."settledByPurchaseId"
  JOIN "CreditPurchase" root ON root."id" = COALESCE(settled."parentId", settled."id")
  JOIN "CreditCardStatement" ps ON ps."id" = p."statementId"
  JOIN "CreditCardStatement" rs ON rs."id" = root."statementId"
  WHERE root."isRefund" OR root."isStatementCharge" OR root."userId" <> p."userId"
   OR rs."creditCardId" <> ps."creditCardId"
 ) THEN RAISE EXCEPTION 'Invalid legacy refinancing link - review required'; END IF;
END $backfill$;

INSERT INTO "CreditPurchaseRecord" ("id", "userId", "creditCardId", "description", "storeName", "purchaseDate",
 "time", "totalAmount", "feeDescription", "feeAmount", "categoryId", "cashbackAccountId", "cashbackAmount",
 "cashbackYieldReferenceRate", "cashbackYieldReferencePercentage", "cashbackYieldPeriod",
 "subscriptionId", "subscriptionOccurrenceDate", "externalId", "createdAt", "updatedAt")
SELECT p."id", p."userId", s."creditCardId", p."description", p."storeName", p."purchaseDate",
 p."time", p."totalAmount", p."feeDescription", p."feeAmount", p."categoryId", p."cashbackAccountId", p."cashbackAmount",
 p."cashbackYieldReferenceRate", p."cashbackYieldReferencePercentage", p."cashbackYieldPeriod",
 p."subscriptionId", p."subscriptionOccurrenceDate", p."externalId", p."createdAt", p."updatedAt"
FROM "CreditPurchase" p JOIN "CreditCardStatement" s ON s."id" = p."statementId"
WHERE p."parentId" IS NULL AND NOT p."isRefund" AND NOT p."isStatementCharge";

-- Keep every historical amount. Allocate only missing occurrences, in integer cents.
WITH balances AS (
 SELECT root."id", root."installments", root."createdAt", root."updatedAt",
  ((root."totalAmount" - SUM(p."installmentAmount")) * 100)::bigint AS remaining,
  root."installments" - COUNT(*) AS missing
 FROM "CreditPurchase" root JOIN "CreditPurchase" p ON COALESCE(p."parentId", p."id") = root."id"
 WHERE root."parentId" IS NULL AND NOT root."isRefund" AND NOT root."isStatementCharge"
 GROUP BY root."id", root."installments", root."totalAmount", root."createdAt", root."updatedAt"
), numbered AS (
 SELECT b.*, n.number, p."installmentAmount", p."hasImportedAmount",
  COUNT(*) FILTER (WHERE p."id" IS NULL) OVER (PARTITION BY b."id" ORDER BY n.number) AS missing_number
 FROM balances b CROSS JOIN LATERAL generate_series(1, b."installments") n(number)
 LEFT JOIN "CreditPurchase" p ON COALESCE(p."parentId", p."id") = b."id" AND p."currentInstallment" = n.number
)
INSERT INTO "CreditInstallmentPlan" ("purchaseId", "number", "amount", "hasImportedAmount", "createdAt", "updatedAt")
SELECT "id", number, COALESCE("installmentAmount",
 (remaining / NULLIF(missing, 0) + CASE WHEN missing_number <= remaining % NULLIF(missing, 0) THEN 1 ELSE 0 END)::numeric / 100),
 COALESCE("hasImportedAmount", false), "createdAt", "updatedAt" FROM numbered;

INSERT INTO "CreditInstallmentRecord" ("id", "purchaseId", "statementId", "number", "amount", "occurrenceDate",
 "hasImportedAmount", "settledByPurchaseId", "createdAt", "updatedAt")
SELECT p."id", root."id", p."statementId", p."currentInstallment", p."installmentAmount",
 (date_trunc('month', root."purchaseDate") + (p."currentInstallment" - 1) * INTERVAL '1 month'
+ (LEAST(EXTRACT(day FROM root."purchaseDate"), EXTRACT(day FROM date_trunc('month', root."purchaseDate")
+   + p."currentInstallment" * INTERVAL '1 month' - INTERVAL '1 day')) - 1) * INTERVAL '1 day')::date,
 p."hasImportedAmount", COALESCE(settled."parentId", settled."id"), p."createdAt", p."updatedAt"
FROM "CreditPurchase" p JOIN "CreditPurchaseRecord" root ON root."id" = COALESCE(p."parentId", p."id")
LEFT JOIN "CreditPurchase" settled ON settled."id" = p."settledByPurchaseId";

INSERT INTO "CreditRefundRecord" ("id", "purchaseId", "statementId", "creditDate", "amount", "policy",
 "cancellationEligible", "createdAt", "updatedAt")
SELECT r."id", root."id", r."statementId", r."purchaseDate", ABS(r."totalAmount"), 'KEEP_INSTALLMENTS',
 false, r."createdAt", r."updatedAt"
FROM "CreditPurchase" r JOIN "CreditPurchase" source ON source."id" = r."refundOfPurchaseId"
JOIN "CreditPurchaseRecord" root ON root."id" = COALESCE(source."parentId", source."id") WHERE r."isRefund";

INSERT INTO "CreditStatementCharge" ("id", "statementId", "description", "amount", "chargeDate", "isSettled", "createdAt", "updatedAt")
SELECT p."id", p."statementId", p."description", p."installmentAmount",
 (date_trunc('month', root."purchaseDate") + (p."currentInstallment" - 1) * INTERVAL '1 month'
+ (LEAST(EXTRACT(day FROM root."purchaseDate"), EXTRACT(day FROM date_trunc('month', root."purchaseDate")
+   + p."currentInstallment" * INTERVAL '1 month' - INTERVAL '1 day')) - 1) * INTERVAL '1 day')::date,
 p."isSettled", p."createdAt", p."updatedAt"
FROM "CreditPurchase" p JOIN "CreditPurchase" root ON root."id" = COALESCE(p."parentId", p."id")
WHERE root."isStatementCharge" AND NOT p."isRefund";

-- One source ID maps to one normalized entry, or an explicit refund review.
-- Archive source payload for auditing; active metadata always comes from the purchase.
INSERT INTO "CreditPurchaseLegacyEntry" ("id", "purchaseId", "installmentId", "refundId", "chargeId",
 "requiresRefundReview", "original", "createdAt", "updatedAt")
SELECT p."id", COALESCE(i."purchaseId", r."purchaseId"), i."id", r."id", c."id",
 p."isRefund" AND r."id" IS NULL,
 to_jsonb(p) || jsonb_build_object('tags', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t."id")
  FROM "TagAssignment" t WHERE t."entityType" = 'CREDIT_PURCHASE' AND t."entityId" = p."id"), '[]'::jsonb)),
 p."createdAt", p."updatedAt"
FROM "CreditPurchase" p LEFT JOIN "CreditInstallmentRecord" i ON i."id" = p."id"
LEFT JOIN "CreditRefundRecord" r ON r."id" = p."id" LEFT JOIN "CreditStatementCharge" c ON c."id" = p."id";

ALTER TABLE "CreditPurchaseLegacyEntry" ADD CONSTRAINT "CreditPurchaseLegacyEntry_target_check"
 CHECK (("requiresRefundReview" AND "purchaseId" IS NULL AND "installmentId" IS NULL AND "refundId" IS NULL AND "chargeId" IS NULL)
  OR (NOT "requiresRefundReview" AND num_nonnulls("installmentId", "refundId", "chargeId") = 1
   AND (("chargeId" IS NOT NULL AND "purchaseId" IS NULL) OR ("chargeId" IS NULL AND "purchaseId" IS NOT NULL))));`,
					},
				],
				id: "creditPurchases.backfill",
				label: "Copy legacy credit entries to normalized storage with audit mapping",
				operationClass: "data",
				postcheck: [
					{
						description: "Every legacy entry has a normalized target or explicit review",
						sql: `SELECT NOT EXISTS (SELECT 1 FROM "CreditPurchase" p LEFT JOIN "CreditPurchaseLegacyEntry" m ON m."id" = p."id" WHERE m."id" IS NULL) AS result`,
					},
				],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
