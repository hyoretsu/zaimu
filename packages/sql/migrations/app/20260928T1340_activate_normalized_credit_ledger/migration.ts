#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/99eed01c4d9e431eb6a398664c2c9fb75f8fb90ecb7a8434ad623361534378e7/contract";
import endContract from "../../snapshots/99eed01c4d9e431eb6a398664c2c9fb75f8fb90ecb7a8434ad623361534378e7/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/a08745da75bf1dc6481b60f5dbbb59e2bc58c5a1e5ffc7a24cd64884daa36a66/contract";
import startContract from "../../snapshots/a08745da75bf1dc6481b60f5dbbb59e2bc58c5a1e5ffc7a24cd64884daa36a66/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropConstraint({
				constraint: "CreditCardImportItem_reconciledCreditPurchaseId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.dropConstraint({
				constraint: "CreditPurchaseHistory_creditPurchaseId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "CreditPurchaseHistory",
			}),
			this.dropConstraint({
				constraint: "DebtPurchaseLink_creditPurchaseId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.dropConstraint({
				constraint: "DebtSplit_creditPurchaseId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "DebtSplit",
			}),
			this.createTable({
				columns: [
					col("chargeId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("installmentId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
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
				],
				constraints: [primaryKey(["id"], { name: "CreditEntryReference_pkey" })],
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addColumn({
				column: col("dueDate", "date", { codecRef: { codecId: "pg/date@1" } }),
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.addColumn({
				column: col("statementDate", "date", { codecRef: { codecId: "pg/date@1" } }),
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.addColumn({
				column: col("isSettled", "bool", {
					codecRef: { codecId: "pg/bool@1" },
					default: lit(false),
					notNull: true,
				}),
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.addColumn({
				column: col("refinancingFeeAmount", "numeric(12,2)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
				}),
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addColumn({
				column: col("externalId", "character varying(200)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
				}),
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addColumn({
				column: col("time", "time(3)", {
					codecRef: { codecId: "pg/time@1", typeParams: { precision: 3 } },
				}),
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addColumn({
				column: col("externalId", "character varying(200)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
				}),
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addColumn({
				column: col("settledByPurchaseId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addColumn({
				column: col("time", "time(3)", {
					codecRef: { codecId: "pg/time@1", typeParams: { precision: 3 } },
				}),
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addUnique({
				columns: ["chargeId"],
				constraint: "CreditEntryReference_chargeId_key",
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addUnique({
				columns: ["installmentId"],
				constraint: "CreditEntryReference_installmentId_key",
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addUnique({
				columns: ["refundId"],
				constraint: "CreditEntryReference_refundId_key",
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addUnique({
				columns: ["externalId"],
				constraint: "CreditRefundRecord_externalId_key",
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addUnique({
				columns: ["externalId"],
				constraint: "CreditStatementCharge_externalId_key",
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.createIndex({
				columns: ["purchaseId"],
				index: "CreditEntryReference_purchaseId_idx",
				schema: "public",
				table: "CreditEntryReference",
			}),
			rawSql({
				execute: [
					{
						description: "creditLedger.remap",
						sql: `LOCK TABLE "CreditPurchase" IN ACCESS EXCLUSIVE MODE;
INSERT INTO "CreditEntryReference" ("id", "purchaseId", "installmentId", "refundId", "chargeId", "requiresRefundReview")
SELECT "id", "purchaseId", "installmentId", "refundId", "chargeId", "requiresRefundReview" FROM "CreditPurchaseLegacyEntry";
UPDATE "CreditPurchaseRecord" n SET "refinancingFeeAmount" = p."refinancingFeeAmount" FROM "CreditPurchase" p WHERE p."id" = n."id";
UPDATE "CreditInstallmentRecord" n SET "isSettled" = p."isSettled" FROM "CreditPurchase" p WHERE p."id" = n."id";
UPDATE "CreditRefundRecord" n SET "time" = p."time", "externalId" = p."externalId" FROM "CreditPurchase" p WHERE p."id" = n."id";
UPDATE "CreditStatementCharge" n SET "time" = p."time", "externalId" = p."externalId", "settledByPurchaseId" = COALESCE(s."parentId", s."id") FROM "CreditPurchase" p LEFT JOIN "CreditPurchase" s ON s."id" = p."settledByPurchaseId" WHERE p."id" = n."id";
UPDATE "CreditInstallmentPlan" plan SET "statementDate" = s."statementDate", "dueDate" = s."dueDate" FROM "CreditInstallmentRecord" i JOIN "CreditCardStatement" s ON s."id" = i."statementId" WHERE plan."purchaseId" = i."purchaseId" AND plan."number" = i."number";
DELETE FROM "TagAssignment" t USING "CreditEntryReference" r WHERE t."entityType" = 'CREDIT_PURCHASE' AND t."entityId" = r."id" AND (r."id" IS DISTINCT FROM r."purchaseId") AND NOT r."requiresRefundReview";
`,
					},
				],
				id: "creditLedger.remap",
				label: "creditLedger.remap",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditEntryReference_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["installmentId"],
					name: "CreditEntryReference_installmentId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditInstallmentRecord" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["refundId"],
					name: "CreditEntryReference_refundId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditRefundRecord" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["chargeId"],
					name: "CreditEntryReference_chargeId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditStatementCharge" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reconciledCreditPurchaseId"],
					name: "CreditCardImportItem_reconciledCreditPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["settledByPurchaseId"],
					name: "CreditInstallmentRecord_settledByPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditPurchaseId"],
					name: "CreditPurchaseHistory_creditPurchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "CreditPurchaseHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["cashbackAccountId"],
					name: "CreditPurchaseRecord_cashbackAccountId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["subscriptionId"],
					name: "CreditPurchaseRecord_subscriptionId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Subscription" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["settledByPurchaseId"],
					name: "CreditStatementCharge_settledByPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditPurchaseId"],
					name: "DebtPurchaseLink_creditPurchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditPurchaseId"],
					name: "DebtSplit_creditPurchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.dropTable({ schema: "public", table: "CreditPurchase" }),
			rawSql({
				execute: [
					{
						description: "Enforce normalized credit invariants and create read projections",
						sql: `ALTER TABLE "CreditEntryReference" ADD CONSTRAINT "CreditEntryReference_target_check" CHECK (
 ("requiresRefundReview" AND num_nonnulls("purchaseId", "installmentId", "refundId", "chargeId") = 0)
 OR (NOT "requiresRefundReview" AND num_nonnulls("installmentId", "refundId", "chargeId") <= 1
 AND (("chargeId" IS NOT NULL AND "purchaseId" IS NULL) OR ("chargeId" IS NULL AND "purchaseId" IS NOT NULL))));
ALTER TABLE "CreditInstallmentPlan" ADD CONSTRAINT "CreditInstallmentPlan_calendar_check" CHECK (("statementDate" IS NULL) = ("dueDate" IS NULL));
CREATE FUNCTION enforce_credit_purchase_integrity() RETURNS trigger LANGUAGE plpgsql AS $integrity$
DECLARE target varchar(36); total numeric; planned numeric; count_plan integer; max_plan integer; owner_id varchar(36); card_id varchar(36);
BEGIN
 IF TG_TABLE_NAME = 'CreditPurchaseRecord' THEN target := COALESCE(NEW."id", OLD."id");
 ELSE target := COALESCE(NEW."purchaseId", OLD."purchaseId"); END IF;
 SELECT "totalAmount", "userId", "creditCardId" INTO total, owner_id, card_id FROM "CreditPurchaseRecord" WHERE "id" = target FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT sum("amount"), count(*), max("number") INTO planned, count_plan, max_plan FROM "CreditInstallmentPlan" WHERE "purchaseId" = target;
 IF planned IS DISTINCT FROM total OR count_plan <> max_plan THEN RAISE EXCEPTION 'Purchase plan must match total and contain consecutive installments'; END IF;
 IF (SELECT COALESCE(sum("amount"), 0) FROM "CreditRefundRecord" WHERE "purchaseId" = target AND "deletedAt" IS NULL) > total THEN RAISE EXCEPTION 'Refunds exceed purchase total'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id" = c."financialAccountId" WHERE c."id" = card_id AND a."userId" = owner_id) THEN RAISE EXCEPTION 'Purchase card belongs to another owner'; END IF;
 IF EXISTS (SELECT 1 FROM "CreditInstallmentRecord" i JOIN "CreditCardStatement" s ON s."id" = i."statementId" LEFT JOIN "CreditInstallmentPlan" plan ON plan."purchaseId" = i."purchaseId" AND plan."number" = i."number" WHERE i."purchaseId" = target AND (s."creditCardId" <> card_id OR plan."amount" IS DISTINCT FROM i."amount"))
 OR EXISTS (SELECT 1 FROM "CreditRefundRecord" r JOIN "CreditCardStatement" s ON s."id" = r."statementId" WHERE r."purchaseId" = target AND s."creditCardId" <> card_id) THEN RAISE EXCEPTION 'Credit entry card or installment amount mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM "CreditPurchaseRecord" p WHERE p."id" = target AND
 ((p."categoryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Category" x WHERE x."id" = p."categoryId" AND x."userId" = owner_id)) OR
 (p."cashbackAccountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialAccount" x WHERE x."id" = p."cashbackAccountId" AND x."userId" = owner_id)) OR
 (p."subscriptionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Subscription" x WHERE x."id" = p."subscriptionId" AND x."userId" = owner_id)))) THEN RAISE EXCEPTION 'Purchase metadata belongs to another owner'; END IF;
 RETURN NULL;
END $integrity$;
CREATE CONSTRAINT TRIGGER "CreditPurchaseRecord_integrity" AFTER INSERT OR UPDATE ON "CreditPurchaseRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity();
CREATE CONSTRAINT TRIGGER "CreditInstallmentPlan_integrity" AFTER INSERT OR UPDATE OR DELETE ON "CreditInstallmentPlan" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity();
CREATE CONSTRAINT TRIGGER "CreditInstallmentRecord_integrity" AFTER INSERT OR UPDATE ON "CreditInstallmentRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity();
CREATE CONSTRAINT TRIGGER "CreditRefundRecord_integrity" AFTER INSERT OR UPDATE ON "CreditRefundRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity();
CREATE FUNCTION enforce_credit_refund_policy() RETURNS trigger LANGUAGE plpgsql AS $policy$
BEGIN
 IF OLD."creditRefundPolicy" IS NOT NULL AND NEW."creditRefundPolicy" IS DISTINCT FROM OLD."creditRefundPolicy" THEN RAISE EXCEPTION 'Institution refund policy is immutable'; END IF;
 RETURN NEW;
END $policy$;
CREATE TRIGGER "FinancialInstitution_refund_policy" BEFORE UPDATE OF "creditRefundPolicy" ON "FinancialInstitution" FOR EACH ROW EXECUTE FUNCTION enforce_credit_refund_policy();
CREATE FUNCTION credit_cycle_date(purchased date, number integer, closing integer) RETURNS date LANGUAGE sql IMMUTABLE AS $cycle$
 WITH month AS (SELECT date_trunc('month', purchased)::date + (number - 1) * interval '1 month' AS first), occurrence AS (
 SELECT first, first::date + (least(extract(day from purchased)::integer, extract(day from first + interval '1 month - 1 day')::integer) - 1) AS day FROM month), cycle_month AS (
 SELECT first + CASE WHEN extract(day from day) > closing THEN interval '1 month' ELSE interval '0 month' END AS first FROM occurrence)
 SELECT first::date + (least(closing, extract(day from first + interval '1 month - 1 day')::integer) - 1) FROM cycle_month
$cycle$;
CREATE VIEW "CreditRefundEffect" AS
SELECT r.*, CASE WHEN r."cancellationEligible" AND r."policy" = 'CANCEL_FUTURE_INSTALLMENTS' AND r."amount" = p."totalAmount"
 AND (SELECT count(*) FROM "CreditRefundRecord" x WHERE x."purchaseId" = r."purchaseId" AND x."deletedAt" IS NULL) = 1
 THEN COALESCE((SELECT sum(plan."amount") FROM "CreditInstallmentPlan" plan
 LEFT JOIN "CreditInstallmentRecord" i ON i."purchaseId" = plan."purchaseId" AND i."number" = plan."number"
 LEFT JOIN "CreditCardStatement" s ON s."id" = i."statementId"
 WHERE plan."purchaseId" = p."id" AND NOT COALESCE(i."isSettled", false) AND i."settledByPurchaseId" IS NULL
 AND COALESCE(s."statementDate", plan."statementDate", credit_cycle_date(p."purchaseDate", plan."number", c."statementDay")) > cs."statementDate"), 0)
 ELSE 0 END AS "canceledAmount"
FROM "CreditRefundRecord" r JOIN "CreditPurchaseRecord" p ON p."id" = r."purchaseId"
JOIN "CreditCard" c ON c."id" = p."creditCardId" JOIN "CreditCardStatement" cs ON cs."id" = r."statementId"
WHERE r."deletedAt" IS NULL AND r."creditDate" <= CURRENT_DATE;
CREATE VIEW "CreditEntry" AS
SELECT i."id", p."id" AS "purchaseId", 'INSTALLMENT'::text AS "entryKind", p."userId", p."creditCardId", i."statementId",
 p."description", p."storeName", p."purchaseDate", i."occurrenceDate", p."time", p."totalAmount",
 (SELECT count(*)::smallint FROM "CreditInstallmentPlan" plan WHERE plan."purchaseId" = p."id") AS "installments",
 i."number" AS "currentInstallment", i."amount" AS "installmentAmount", i."hasImportedAmount",
 CASE WHEN i."id" = p."id" THEN NULL::varchar ELSE p."id" END AS "parentId", false AS "isRefund", false AS "isStatementCharge",
 NULL::varchar AS "refundOfPurchaseId", i."isSettled", i."settledByPurchaseId", p."feeAmount", p."feeDescription", p."refinancingFeeAmount", p."categoryId",
 CASE WHEN i."id" = p."id" THEN p."cashbackAccountId" END AS "cashbackAccountId",
 CASE WHEN i."id" = p."id" THEN p."cashbackAmount" END AS "cashbackAmount",
 p."cashbackYieldPeriod", p."cashbackYieldReferencePercentage", p."cashbackYieldReferenceRate",
 p."subscriptionId", p."subscriptionOccurrenceDate", p."externalId", i."createdAt", greatest(i."updatedAt", p."updatedAt") AS "updatedAt"
FROM "CreditInstallmentRecord" i JOIN "CreditPurchaseRecord" p ON p."id" = i."purchaseId" JOIN "CreditCardStatement" s ON s."id" = i."statementId"
WHERE NOT EXISTS (SELECT 1 FROM "CreditRefundEffect" r JOIN "CreditCardStatement" rs ON rs."id" = r."statementId" WHERE r."purchaseId" = p."id" AND r."canceledAmount" > 0 AND s."statementDate" > rs."statementDate" AND NOT i."isSettled" AND i."settledByPurchaseId" IS NULL)
UNION ALL
SELECT r."id", p."id", 'REFUND', p."userId", p."creditCardId", r."statementId", p."description", p."storeName", r."creditDate", r."creditDate", r."time", -r."amount", 1::smallint, 1::smallint, -(r."amount" - r."canceledAmount"), r."externalId" IS NOT NULL,
 NULL, true, false, p."id", false, NULL, NULL, NULL, NULL, p."categoryId", NULL, NULL, p."cashbackYieldPeriod", p."cashbackYieldReferencePercentage", p."cashbackYieldReferenceRate", NULL, NULL, r."externalId", r."createdAt", greatest(r."updatedAt", p."updatedAt")
FROM "CreditRefundEffect" r JOIN "CreditPurchaseRecord" p ON p."id" = r."purchaseId"
UNION ALL
SELECT ch."id", NULL, 'CHARGE', a."userId", s."creditCardId", ch."statementId", ch."description", NULL, ch."chargeDate", ch."chargeDate", ch."time", ch."amount", 1::smallint, 1::smallint, ch."amount", ch."externalId" IS NOT NULL,
 NULL, false, true, NULL, ch."isSettled", ch."settledByPurchaseId", NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ch."externalId", ch."createdAt", ch."updatedAt"
FROM "CreditStatementCharge" ch JOIN "CreditCardStatement" s ON s."id" = ch."statementId" JOIN "CreditCard" c ON c."id" = s."creditCardId" JOIN "FinancialAccount" a ON a."id" = c."financialAccountId";
`,
					},
				],
				id: "creditLedger.integrity",
				label: "Normalized credit integrity and read projections",
				operationClass: "additive",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
