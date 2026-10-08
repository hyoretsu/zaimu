#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/6348b1486ea4d1e990ccdfc26aa30c3af4c7c4b6641129b0a3b66a9e5adae3a3/contract";
import startContract from "../../snapshots/6348b1486ea4d1e990ccdfc26aa30c3af4c7c4b6641129b0a3b66a9e5adae3a3/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract";
import endContract from "../../snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("createdAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("kind", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("series", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("startDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("updatedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialHistoryCollection",
			}),
			this.createTable({
				columns: [
					col("collectionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("unitId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["collectionId", "unitId"])],
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("completedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("createdAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("generation", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("kind", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("lastError", "character varying(1000)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
					}),
					col("leaseToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("lockedUntil", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("nextAttemptAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("series", "character varying(10)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 10 } },
						notNull: true,
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("state", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createTable({
				columns: [
					col("leaseToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("lockedUntil", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("provider", "character varying(40)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 40 } },
						notNull: true,
					}),
					col("slot", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
				],
				constraints: [primaryKey(["provider", "slot"])],
				schema: "public",
				table: "FinancialProviderSlot",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.addColumn({
				column: col("leaseToken", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "ConsumerReceipt",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImport",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.addColumn({
				column: col("bookingCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "DebtEvent",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "DebtSplit",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Loan",
			}),
			this.addColumn({
				column: col("accountAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "LoanPayment",
			}),
			this.addColumn({
				column: col("accountCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "LoanPayment",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "LoanPayment",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Recurrence",
			}),
			this.addColumn({
				column: col("conversionCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "RewardsAccount",
			}),
			this.addColumn({
				column: col("bookingCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("conversionSource", "character varying(20)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
					default: lit("DAILY"),
					notNull: true,
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("destinationAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("destinationCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("paymentAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("paymentCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "TransactionImport",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addColumn({
				column: col("preferredCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "user",
			}),
			rawSql({
				execute: [
					{
						description: "Atomically widen money columns and restore credit views",
						sql: `DO $money_precision$
DECLARE
 saved_views jsonb;
 saved_view jsonb;
BEGIN
 -- Preserve live definitions, including renamed and removed legacy columns.
 SELECT jsonb_agg(jsonb_build_object(
  'name', c.relname, 'definition', pg_get_viewdef(c.oid, true),
  'owner', pg_get_userbyid(c.relowner), 'options', array_to_string(c.reloptions, ', '),
  'grants', (SELECT string_agg(format('GRANT %s ON public.%I TO %s%s;',
   a.privilege_type, c.relname,
   CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
   CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END), ' ')
   FROM aclexplode(c.relacl) a)
 ) ORDER BY CASE c.relname WHEN 'CreditRefundEffect' THEN 1 ELSE 2 END)
 INTO saved_views FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v'
 AND c.relname IN ('CreditRefundEffect', 'CreditEntry', 'CreditConsumption');
 -- Unknown dependents abort safely: never use CASCADE.
 DROP VIEW IF EXISTS public."CreditEntry", public."CreditConsumption";
 DROP VIEW IF EXISTS public."CreditRefundEffect";
 ALTER TABLE public."BalanceAdjustment" ALTER COLUMN "balance" TYPE numeric(20,6) USING "balance"::numeric(20,6);
 ALTER TABLE public."CreditCard" ALTER COLUMN "creditLimit" TYPE numeric(20,6) USING "creditLimit"::numeric(20,6);
 ALTER TABLE public."CreditCard" ALTER COLUMN "securityDeposit" TYPE numeric(20,6) USING "securityDeposit"::numeric(20,6);
 ALTER TABLE public."CreditCardImport" ALTER COLUMN "reportedPreviousBalance" TYPE numeric(20,6) USING "reportedPreviousBalance"::numeric(20,6);
 ALTER TABLE public."CreditCardImportItem" ALTER COLUMN "installmentAmount" TYPE numeric(20,6) USING "installmentAmount"::numeric(20,6);
 ALTER TABLE public."CreditCardImportItem" ALTER COLUMN "totalAmount" TYPE numeric(20,6) USING "totalAmount"::numeric(20,6);
 ALTER TABLE public."CreditCardStatement" ALTER COLUMN "paidAmount" TYPE numeric(20,6) USING "paidAmount"::numeric(20,6);
 ALTER TABLE public."CreditCardStatement" ALTER COLUMN "totalAmount" TYPE numeric(20,6) USING "totalAmount"::numeric(20,6);
 ALTER TABLE public."CreditInstallmentPlan" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."CreditInstallmentRecord" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."CreditPurchaseRecord" ALTER COLUMN "feeAmount" TYPE numeric(20,6) USING "feeAmount"::numeric(20,6);
 ALTER TABLE public."CreditPurchaseRecord" ALTER COLUMN "originalAmount" TYPE numeric(20,6) USING "originalAmount"::numeric(20,6);
 ALTER TABLE public."CreditPurchaseRecord" ALTER COLUMN "refinancingFeeAmount" TYPE numeric(20,6) USING "refinancingFeeAmount"::numeric(20,6);
 ALTER TABLE public."CreditPurchaseRecord" ALTER COLUMN "totalAmount" TYPE numeric(20,6) USING "totalAmount"::numeric(20,6);
 ALTER TABLE public."CreditRefundRecord" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."CreditStatementCharge" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."DebtEvent" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."DebtEvent" ALTER COLUMN "effect" TYPE numeric(20,6) USING "effect"::numeric(20,6);
 ALTER TABLE public."DebtSplitParticipant" ALTER COLUMN "fixedAmount" TYPE numeric(20,6) USING "fixedAmount"::numeric(20,6);
 ALTER TABLE public."FinancialAccount" ALTER COLUMN "balance" TYPE numeric(20,6) USING "balance"::numeric(20,6);
 ALTER TABLE public."FinancialAccountYield" ALTER COLUMN "amount" TYPE numeric(20,8) USING "amount"::numeric(20,8);
 ALTER TABLE public."FinancialInstitutionYieldRule" ALTER COLUMN "upToBalance" TYPE numeric(20,6) USING "upToBalance"::numeric(20,6);
 ALTER TABLE public."Loan" ALTER COLUMN "installmentAmount" TYPE numeric(20,6) USING "installmentAmount"::numeric(20,6);
 ALTER TABLE public."Loan" ALTER COLUMN "principalAmount" TYPE numeric(20,6) USING "principalAmount"::numeric(20,6);
 ALTER TABLE public."LoanPayment" ALTER COLUMN "interestPaid" TYPE numeric(20,6) USING "interestPaid"::numeric(20,6);
 ALTER TABLE public."LoanPayment" ALTER COLUMN "principalPaid" TYPE numeric(20,6) USING "principalPaid"::numeric(20,6);
 ALTER TABLE public."LoanPayment" ALTER COLUMN "totalPaid" TYPE numeric(20,6) USING "totalPaid"::numeric(20,6);
 ALTER TABLE public."Recurrence" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."RewardsAccount" ALTER COLUMN "conversionAmount" TYPE numeric(20,6) USING "conversionAmount"::numeric(20,6);
 ALTER TABLE public."Transaction" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."Transaction" ALTER COLUMN "originalAmount" TYPE numeric(20,6) USING "originalAmount"::numeric(20,6);
 ALTER TABLE public."TransactionImportItem" ALTER COLUMN "amount" TYPE numeric(20,6) USING "amount"::numeric(20,6);
 ALTER TABLE public."TransactionImportItem" ALTER COLUMN "balanceAfter" TYPE numeric(20,6) USING "balanceAfter"::numeric(20,6);
 FOR saved_view IN SELECT value FROM jsonb_array_elements(saved_views) LOOP
  EXECUTE format('CREATE VIEW public.%I %s AS %s', saved_view->>'name',
   CASE WHEN saved_view->>'options' IS NULL THEN '' ELSE 'WITH (' || (saved_view->>'options') || ')' END,
   saved_view->>'definition');
  EXECUTE format('ALTER VIEW public.%I OWNER TO %I', saved_view->>'name', saved_view->>'owner');
  IF saved_view->>'grants' IS NOT NULL THEN EXECUTE saved_view->>'grants'; END IF;
 END LOOP;
END $money_precision$;`,
					},
				],
				id: "internationalMoney.precisionWithCreditViews",
				label: "Widen monetary precision while preserving credit views",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.addUnique({
				columns: ["deduplicationKey"],
				constraint: "FinancialHistoryCollection_deduplicationKey_key",
				schema: "public",
				table: "FinancialHistoryCollection",
			}),
			this.addUnique({
				columns: ["deduplicationKey"],
				constraint: "FinancialHistoryUnit_deduplicationKey_key",
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createIndex({
				columns: ["collectionId"],
				index: "FinancialHistoryCollectionUnit_collectionId_idx_b344fc1a",
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.createIndex({
				columns: ["unitId"],
				index: "FinancialHistoryCollectionUnit_unit_idx",
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.createIndex({
				columns: ["kind", "series", "startDate", "endDate"],
				index: "FinancialHistoryUnit_coverage_idx",
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createIndex({
				columns: ["state", "nextAttemptAt", "lockedUntil"],
				index: "FinancialHistoryUnit_recovery_idx",
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["collectionId"],
					name: "FinancialHistoryCollectionUnit_collectionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialHistoryCollection" },
				},
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["unitId"],
					name: "FinancialHistoryCollectionUnit_unitId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialHistoryUnit" },
				},
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			rawSql({
				execute: [
					{
						description:
							"Backfill native money without reinterpreting original foreign principal",
						sql: `
UPDATE "CreditPurchaseRecord" p SET "bookingCurrency"=c."currency" FROM "CreditCard" c WHERE c."id"=p."creditCardId";
UPDATE "CreditCardStatement" s SET "currency"=c."currency" FROM "CreditCard" c WHERE c."id"=s."creditCardId";
UPDATE "Transaction" t SET "bookingCurrency"=a."currency" FROM "FinancialAccount" a WHERE a."id"=COALESCE(t."originFinancialAccountId",t."destinationFinancialAccountId");
UPDATE "Transaction" t SET "destinationAmount"=t."amount", "destinationCurrency"=a."currency" FROM "FinancialAccount" a WHERE t."type"='TRANSFER' AND a."id"=t."destinationFinancialAccountId";
UPDATE "Transaction" t SET "paymentAmount"=t."amount", "paymentCurrency"=c."currency" FROM "CreditCard" c WHERE c."id"=t."paymentCreditCardId";
INSERT INTO "FinancialHistoryUnit" ("id","deduplicationKey","kind","series","startDate","endDate","state","completedAt")
SELECT cuid2(), 'INTEREST:' || series || ':' || start_date || ':' || end_date, 'INTEREST', series, start_date::date, end_date::date, 'COMPLETED', now()
FROM (SELECT DISTINCT "payload"->>'referenceType' AS series, "payload"->>'startDate' AS start_date, "payload"->>'endDate' AS end_date FROM "OutboxEvent" WHERE "eventType"='referenceRate.historyFetched') coverage
WHERE series IN ('CDI','SELIC') AND start_date IS NOT NULL AND end_date IS NOT NULL
ON CONFLICT ("deduplicationKey") DO NOTHING;`,
					},
				],
				id: "internationalMoney.legacyDenominationsAndCoverage",
				label: "Preserve native currencies and import proven interest coverage",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
