// Custom database objects of the native baseline. Hand-maintained; never regenerate (see migration.ts).
import { readFileSync } from "node:fs";
import { rawSql } from "@prisma/orm-postgres/migration";

const raw = (
	id: string,
	label: string,
	sql: string,
	check: string,
	operationClass: "additive" | "data" = "additive",
	invariantId?: string,
) =>
	rawSql({
		execute: [{ description: label, sql }],
		id,
		...(invariantId ? { invariantId } : {}),
		label,
		operationClass,
		postcheck: [{ description: `${label} is present`, sql: check }],
		precheck: [],
		target: { id: "postgres" },
	});
const file = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

export const preludeOperations = [
	raw(
		"extension.pgcrypto",
		'Enable extension "pgcrypto"',
		"CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public",
		"SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') AS ok",
		"additive",
	),
	raw(
		"extension.pg_trgm",
		'Enable extension "pg_trgm"',
		"CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public",
		"SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok",
		"additive",
	),
	raw(
		"extension.unaccent",
		'Enable extension "unaccent"',
		"CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public",
		"SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') AS ok",
		"additive",
	),
	raw(
		"function.cuid2",
		'Create function "cuid2"',
		`CREATE OR REPLACE FUNCTION public.cuid2()
 RETURNS uuid
 LANGUAGE sql
AS $function$
  SELECT gen_random_uuid()
$function$
`,
		"SELECT to_regprocedure('public.cuid2()') IS NOT NULL AS ok",
		"additive",
	),
];

export const customOperations = [
	raw(
		"function.credit_cycle_date",
		'Create function "credit_cycle_date"',
		`CREATE OR REPLACE FUNCTION public.credit_cycle_date(purchased date, number integer, closing integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
 WITH month AS (SELECT date_trunc('month', purchased)::date + (number - 1) * interval '1 month' AS first), occurrence AS (
 SELECT first, first::date + (least(extract(day from purchased)::integer, extract(day from first + interval '1 month - 1 day')::integer) - 1) AS day FROM month), cycle_month AS (
 SELECT first + CASE WHEN extract(day from day) > closing THEN interval '1 month' ELSE interval '0 month' END AS first FROM occurrence)
 SELECT first::date + (least(closing, extract(day from first + interval '1 month - 1 day')::integer) - 1) FROM cycle_month
$function$
`,
		"SELECT to_regprocedure('public.credit_cycle_date(date,integer,integer)') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.enforce_credit_purchase_integrity",
		'Create function "enforce_credit_purchase_integrity"',
		`CREATE OR REPLACE FUNCTION public.enforce_credit_purchase_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE target varchar(36); total numeric; planned numeric; count_plan integer; max_plan integer; owner_id varchar(36); card_id varchar(36);
BEGIN
 IF TG_TABLE_NAME = 'CreditPurchaseRecord' THEN target := COALESCE(NEW."id", OLD."id");
 ELSE target := COALESCE(NEW."purchaseId", OLD."purchaseId"); END IF;
 SELECT "totalAmount", "userId", "creditCardId" INTO total, owner_id, card_id FROM "CreditPurchaseRecord" WHERE "id" = target FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT sum("amount"), count(*), max("number") INTO planned, count_plan, max_plan FROM "CreditInstallmentPlan" WHERE "purchaseId" = target;
 IF planned IS DISTINCT FROM total OR count_plan <> max_plan THEN RAISE EXCEPTION 'Purchase plan must match total and contain consecutive installments'; END IF;

 IF NOT EXISTS (SELECT 1 FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id" = c."financialAccountId" WHERE c."id" = card_id AND a."userId" = owner_id) THEN RAISE EXCEPTION 'Purchase card belongs to another owner'; END IF;
 IF EXISTS (SELECT 1 FROM "CreditInstallmentRecord" i JOIN "CreditCardStatement" s ON s."id" = i."statementId" LEFT JOIN "CreditInstallmentPlan" plan ON plan."purchaseId" = i."purchaseId" AND plan."number" = i."number" WHERE i."purchaseId" = target AND (s."creditCardId" <> card_id OR plan."amount" IS DISTINCT FROM i."amount"))
 OR EXISTS (SELECT 1 FROM "CreditRefundRecord" r JOIN "CreditCardStatement" s ON s."id" = r."statementId" WHERE r."purchaseId" = target AND s."creditCardId" <> card_id) THEN RAISE EXCEPTION 'Credit entry card or installment amount mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM "CreditPurchaseRecord" p WHERE p."id" = target AND
 ((p."cashbackAccountId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FinancialAccount" x WHERE x."id" = p."cashbackAccountId" AND x."userId" = owner_id)) OR
 (p."recurrenceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Recurrence" x WHERE x."id" = p."recurrenceId" AND x."userId" = owner_id)))) THEN RAISE EXCEPTION 'Purchase metadata belongs to another owner'; END IF;
 RETURN NULL;
END $function$
`,
		"SELECT to_regprocedure('public.enforce_credit_purchase_integrity()') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.enforce_credit_refund_policy",
		'Create function "enforce_credit_refund_policy"',
		`CREATE OR REPLACE FUNCTION public.enforce_credit_refund_policy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF OLD."creditRefundPolicy" IS NOT NULL AND NEW."creditRefundPolicy" IS DISTINCT FROM OLD."creditRefundPolicy" THEN RAISE EXCEPTION 'Institution refund policy is immutable'; END IF;
 RETURN NEW;
END $function$
`,
		"SELECT to_regprocedure('public.enforce_credit_refund_policy()') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.markDeletedRecurrencePurchase",
		'Create function "markDeletedRecurrencePurchase"',
		`CREATE OR REPLACE FUNCTION public."markDeletedRecurrencePurchase"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 UPDATE "RecurrenceOccurrence" SET "deletedAt"=CURRENT_TIMESTAMP WHERE "purchaseId"=OLD."id";
 RETURN OLD;
END $function$
`,
		"SELECT to_regprocedure('public.\"markDeletedRecurrencePurchase\"()') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.markDeletedRecurrenceTransaction",
		'Create function "markDeletedRecurrenceTransaction"',
		`CREATE OR REPLACE FUNCTION public."markDeletedRecurrenceTransaction"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 UPDATE "RecurrenceOccurrence" SET "deletedAt"=CURRENT_TIMESTAMP WHERE "transactionId"=OLD."id";
 RETURN OLD;
END $function$
`,
		"SELECT to_regprocedure('public.\"markDeletedRecurrenceTransaction\"()') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.normalize_search",
		'Create function "normalize_search"',
		`CREATE OR REPLACE FUNCTION public.normalize_search(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
RETURN lower(unaccent('unaccent'::regdictionary, COALESCE(value, ''::text)))
`,
		"SELECT to_regprocedure('public.normalize_search(text)') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.trackUpgradeRecurrence",
		'Create function "trackUpgradeRecurrence"',
		`CREATE OR REPLACE FUNCTION public."trackUpgradeRecurrence"()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 UPDATE "ApplicationUpgradeRecurrence" SET "deletedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=OLD."userId" AND "recurrenceId"=OLD."id";
 RETURN OLD;
END $function$
`,
		"SELECT to_regprocedure('public.\"trackUpgradeRecurrence\"()') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.zaimu_ownership_guard",
		'Create function "zaimu_ownership_guard"',
		`CREATE OR REPLACE FUNCTION public.zaimu_ownership_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE record jsonb; old_record jsonb; owner_id text; previous_owner text; caller text; reference_owner text; key text; referenced_table text;
BEGIN
 record:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_record:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 owner_id:=public.zaimu_record_owner(TG_TABLE_NAME,record);
 previous_owner:=public.zaimu_record_owner(TG_TABLE_NAME,old_record);
 IF owner_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended('account-owner:'||owner_id,0)); END IF;
 IF current_setting('zaimu.account_transfer',true)='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 caller:=nullif(current_setting('zaimu.request_user',true),'');
 IF caller IS NOT NULL AND owner_id IS NOT NULL AND owner_id<>caller AND TG_TABLE_NAME NOT IN ('DebtTransactionLink','DebtPurchaseLink','DebtSplitParticipant') AND NOT EXISTS(SELECT 1 FROM public."user" actor WHERE actor."id"=caller AND actor."role"='ADMIN') THEN RAISE EXCEPTION 'Financial ownership changed' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND previous_owner IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Ownership requires account transfer' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='FinancialAccount' AND TG_OP<>'DELETE' AND record->'transferredProfileContext' IS DISTINCT FROM COALESCE(old_record->'transferredProfileContext','null'::jsonb) THEN
  RAISE EXCEPTION 'Transferred financial context is protected' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='TagAssignment' AND TG_OP<>'DELETE' THEN
  referenced_table:=CASE record->>'entityType' WHEN 'TRANSACTION' THEN 'Transaction' WHEN 'CREDIT_PURCHASE' THEN 'CreditPurchaseRecord' WHEN 'RECURRING_PAYMENT' THEN 'Recurrence' END;
  IF referenced_table IS NOT NULL THEN
   EXECUTE format('SELECT public.zaimu_record_owner($1,to_jsonb(row)) FROM public.%I row WHERE "id"=$2',referenced_table) INTO reference_owner USING referenced_table,record->>'entityId';
   IF reference_owner IS NULL AND record->>'entityType'='CREDIT_PURCHASE' THEN SELECT public.zaimu_record_owner('CreditEntryReference',to_jsonb(entry)) INTO reference_owner FROM public."CreditEntryReference" entry WHERE entry."id"=record->>'entityId'; END IF;
   IF reference_owner IS NOT NULL AND owner_id IS NOT NULL AND reference_owner<>owner_id THEN RAISE EXCEPTION 'Cross-owner tag reference' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public."DetachedFinancialRecord" WHERE "entityType"=TG_TABLE_NAME AND "entityId"=record->>'id') THEN
  RAISE EXCEPTION 'Separated financial history is protected' USING ERRCODE='42501';
 END IF;
 IF TG_OP<>'DELETE' THEN
  FOREACH key IN ARRAY ARRAY['originFinancialAccountId','destinationFinancialAccountId','financialAccountId','paymentAccountId','cashbackAccountId','creditCardId','paymentCreditCardId','recurrenceId','categoryId','outgoingFinancialAccountId','incomingFinancialAccountId','firstTransactionId','secondTransactionId','reconciledImportItemId','reconciledCreditPurchaseId','reconciledTransactionId','transactionId','creditPurchaseId','purchaseId','statementId'] LOOP
   IF record->>key IS NULL THEN CONTINUE; END IF;
   referenced_table:=CASE WHEN key IN ('creditCardId','paymentCreditCardId') THEN 'CreditCard' WHEN key='recurrenceId' THEN 'Recurrence' WHEN key='categoryId' THEN 'Category' WHEN key IN ('firstTransactionId','secondTransactionId','reconciledTransactionId','transactionId') THEN 'Transaction' WHEN key='reconciledImportItemId' THEN 'TransactionImportItem' WHEN key IN ('reconciledCreditPurchaseId','creditPurchaseId') THEN 'CreditEntryReference' WHEN key='purchaseId' THEN 'CreditPurchaseRecord' WHEN key='statementId' THEN 'CreditCardStatement' ELSE 'FinancialAccount' END;
   EXECUTE format('SELECT public.zaimu_record_owner($1,to_jsonb(row)) FROM public.%I row WHERE "id"=$2',referenced_table) INTO reference_owner USING referenced_table,record->>key;
   IF reference_owner IS NOT NULL AND owner_id IS NOT NULL AND reference_owner<>owner_id AND TG_TABLE_NAME NOT IN ('DebtTransactionLink','DebtPurchaseLink') THEN RAISE EXCEPTION 'Cross-owner financial reference' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $function$
`,
		"SELECT to_regprocedure('public.zaimu_ownership_guard()') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"function.zaimu_record_owner",
		'Create function "zaimu_record_owner"',
		`CREATE OR REPLACE FUNCTION public.zaimu_record_owner(entity text, record jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE parent_table text; parent_id text; parent_record jsonb;
BEGIN
 IF record IS NULL THEN RETURN NULL; END IF;
 IF record ? 'userId' THEN RETURN record->>'userId'; END IF;
 IF entity='CreditEntryReference' THEN
  IF record->>'purchaseId' IS NOT NULL THEN parent_table:='CreditPurchaseRecord'; parent_id:=record->>'purchaseId';
  ELSIF record->>'installmentId' IS NOT NULL THEN parent_table:='CreditInstallmentRecord'; parent_id:=record->>'installmentId';
  ELSIF record->>'refundId' IS NOT NULL THEN parent_table:='CreditRefundRecord'; parent_id:=record->>'refundId';
  ELSIF record->>'chargeId' IS NOT NULL THEN parent_table:='CreditStatementCharge'; parent_id:=record->>'chargeId';
  ELSE parent_table:='CreditRefundReview'; parent_id:=record->>'id'; END IF;
 ELSIF entity='RecurrenceOccurrence' THEN parent_table:='Recurrence'; parent_id:=record->>'recurrenceId';
 ELSIF entity='OpenFinanceIdentity' THEN parent_table:='OpenFinanceRecord'; parent_id:=record->>'recordId';
 ELSIF entity='UserInstitutionProfileChange' THEN parent_table:='UserFinancialInstitution'; parent_id:=record->>'linkId';
 ELSIF entity='TagAssignment' THEN parent_table:='Category'; parent_id:=record->>'categoryId';
 ELSIF entity='DebtSplitParticipant' THEN parent_table:='DebtSplit'; parent_id:=record->>'debtSplitId';
 ELSIF entity='LoanPayment' THEN parent_table:='Loan'; parent_id:=record->>'loanId';
 ELSIF entity='OpenFinanceBinding' THEN parent_table:='OpenFinanceConnection'; parent_id:=record->>'connectionId';
 ELSIF record ? 'financialAccountId' THEN parent_table:='FinancialAccount'; parent_id:=record->>'financialAccountId';
 ELSIF record ? 'creditCardId' THEN parent_table:='CreditCard'; parent_id:=record->>'creditCardId';
 ELSIF record ? 'purchaseId' THEN parent_table:='CreditPurchaseRecord'; parent_id:=record->>'purchaseId';
 ELSIF record ? 'creditPurchaseId' THEN parent_table:='CreditEntryReference'; parent_id:=record->>'creditPurchaseId';
 ELSIF record ? 'transactionId' THEN parent_table:='Transaction'; parent_id:=record->>'transactionId';
 ELSIF record ? 'transactionImportId' THEN parent_table:='TransactionImport'; parent_id:=record->>'transactionImportId';
 ELSIF record ? 'creditCardImportId' THEN parent_table:='CreditCardImport'; parent_id:=record->>'creditCardImportId';
 ELSIF record ? 'recurrenceId' THEN parent_table:='Recurrence'; parent_id:=record->>'recurrenceId';
 ELSIF record ? 'statementId' THEN parent_table:='CreditCardStatement'; parent_id:=record->>'statementId';
 END IF;
 IF parent_id IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT to_jsonb(row) FROM public.%I row WHERE "id"=$1',parent_table) INTO parent_record USING parent_id;
 RETURN public.zaimu_record_owner(parent_table,parent_record);
END $function$
`,
		"SELECT to_regprocedure('public.zaimu_record_owner(text,jsonb)') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"index.Transaction_description_search_idx",
		'Create index "Transaction_description_search_idx"',
		`CREATE INDEX "Transaction_description_search_idx" ON public."Transaction" USING gin (normalize_search((description)::text) gin_trgm_ops)`,
		"SELECT to_regclass('public.\"Transaction_description_search_idx\"') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"index.Transaction_storeName_search_idx",
		'Create index "Transaction_storeName_search_idx"',
		`CREATE INDEX "Transaction_storeName_search_idx" ON public."Transaction" USING gin (normalize_search(("storeName")::text) gin_trgm_ops)`,
		"SELECT to_regclass('public.\"Transaction_storeName_search_idx\"') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"check.CreditCard_cashback_yield_settings_check",
		'Add check "CreditCard_cashback_yield_settings_check"',
		`ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_cashback_yield_settings_check" CHECK (((("cashbackYieldPeriod" IS NULL) AND ("cashbackYieldReferenceRate" IS NULL) AND ("cashbackYieldReferencePercentage" IS NULL)) OR (("cashbackYieldPeriod" IS NOT NULL) AND ("cashbackYieldReferenceRate" > (0)::numeric) AND ("cashbackYieldReferencePercentage" > (0)::numeric))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditCard_cashback_yield_settings_check') AS ok",
		"additive",
	),
	raw(
		"check.FinancialAccount_yield_tax_rate_check",
		'Add check "FinancialAccount_yield_tax_rate_check"',
		`ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_yield_tax_rate_check" CHECK ((("yieldTaxRate" IS NULL) OR (("yieldTaxRate" >= (0)::numeric) AND ("yieldTaxRate" <= (100)::numeric))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialAccount_yield_tax_rate_check') AS ok",
		"additive",
	),
	raw(
		"check.FinancialAccountYieldRateHistory_yield_tax_rate_check",
		'Add check "FinancialAccountYieldRateHistory_yield_tax_rate_check"',
		`ALTER TABLE "FinancialAccountYieldRateHistory" ADD CONSTRAINT "FinancialAccountYieldRateHistory_yield_tax_rate_check" CHECK ((("yieldTaxRate" IS NULL) OR (("yieldTaxRate" >= (0)::numeric) AND ("yieldTaxRate" <= (100)::numeric))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialAccountYieldRateHistory_yield_tax_rate_check') AS ok",
		"additive",
	),
	raw(
		"check.FinancialAccount_yield_settings_check",
		'Add check "FinancialAccount_yield_settings_check"',
		`ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_yield_settings_check" CHECK (((("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL)) AND (("yieldFixedRate" IS NULL) OR ("yieldFixedRate" > (0)::numeric)) AND (("yieldReferencePercentage" IS NULL) OR ("yieldReferencePercentage" > (0)::numeric)) AND (("yieldFixedRate" IS NOT NULL) OR ("yieldReferenceType" IS NOT NULL) OR ("yieldPeriod" IS NULL)) AND (("yieldFixedRate" IS NULL) OR ("yieldPeriod" IS NOT NULL))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialAccount_yield_settings_check') AS ok",
		"additive",
	),
	raw(
		"check.FinancialAccountYieldRateHistory_yield_settings_check",
		'Add check "FinancialAccountYieldRateHistory_yield_settings_check"',
		`ALTER TABLE "FinancialAccountYieldRateHistory" ADD CONSTRAINT "FinancialAccountYieldRateHistory_yield_settings_check" CHECK (((("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL)) AND (("yieldFixedRate" IS NULL) OR ("yieldFixedRate" > (0)::numeric)) AND (("yieldReferencePercentage" IS NULL) OR ("yieldReferencePercentage" > (0)::numeric)) AND (("yieldFixedRate" IS NOT NULL) OR ("yieldReferenceType" IS NOT NULL) OR ("yieldPeriod" IS NULL)) AND (("yieldFixedRate" IS NULL) OR ("yieldPeriod" IS NOT NULL))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialAccountYieldRateHistory_yield_settings_check') AS ok",
		"additive",
	),
	raw(
		"check.FinancialInstitutionYieldRule_yield_settings_check",
		'Add check "FinancialInstitutionYieldRule_yield_settings_check"',
		`ALTER TABLE "FinancialInstitutionYieldRule" ADD CONSTRAINT "FinancialInstitutionYieldRule_yield_settings_check" CHECK (((("yieldReferenceType" IS NULL) = ("yieldReferencePercentage" IS NULL)) AND (("yieldFixedRate" IS NULL) OR ("yieldFixedRate" > (0)::numeric)) AND (("yieldReferencePercentage" IS NULL) OR ("yieldReferencePercentage" > (0)::numeric)) AND (("yieldFixedRate" IS NOT NULL) OR ("yieldReferenceType" IS NOT NULL))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialInstitutionYieldRule_yield_settings_check') AS ok",
		"additive",
	),
	raw(
		"check.CreditEntryReference_target_check",
		'Add check "CreditEntryReference_target_check"',
		`ALTER TABLE "CreditEntryReference" ADD CONSTRAINT "CreditEntryReference_target_check" CHECK ((("requiresRefundReview" AND (num_nonnulls("purchaseId", "installmentId", "refundId", "chargeId") = 0)) OR ((NOT "requiresRefundReview") AND (num_nonnulls("installmentId", "refundId", "chargeId") <= 1) AND ((("chargeId" IS NOT NULL) AND ("purchaseId" IS NULL)) OR (("chargeId" IS NULL) AND ("purchaseId" IS NOT NULL))))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditEntryReference_target_check') AS ok",
		"additive",
	),
	raw(
		"check.CreditInstallmentPlan_calendar_check",
		'Add check "CreditInstallmentPlan_calendar_check"',
		`ALTER TABLE "CreditInstallmentPlan" ADD CONSTRAINT "CreditInstallmentPlan_calendar_check" CHECK ((("statementDate" IS NULL) = ("dueDate" IS NULL)))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditInstallmentPlan_calendar_check') AS ok",
		"additive",
	),
	raw(
		"check.Recurrence_installments_check",
		'Add check "Recurrence_installments_check"',
		`ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_installments_check" CHECK ((((installments >= 1) AND (installments <= 48)) AND (((movement)::text = 'CARD_PURCHASE'::text) OR (installments = 1))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Recurrence_installments_check') AS ok",
		"additive",
	),
	raw(
		"check.CreditInstallmentPlan_amount_positive",
		'Add check "CreditInstallmentPlan_amount_positive"',
		`ALTER TABLE "CreditInstallmentPlan" ADD CONSTRAINT "CreditInstallmentPlan_amount_positive" CHECK (((amount > (0)::numeric) AND ((number >= 1) AND (number <= 48))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditInstallmentPlan_amount_positive') AS ok",
		"additive",
	),
	raw(
		"check.CreditInstallmentRecord_amount_positive",
		'Add check "CreditInstallmentRecord_amount_positive"',
		`ALTER TABLE "CreditInstallmentRecord" ADD CONSTRAINT "CreditInstallmentRecord_amount_positive" CHECK (((amount > (0)::numeric) AND ((number >= 1) AND (number <= 48))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditInstallmentRecord_amount_positive') AS ok",
		"additive",
	),
	raw(
		"check.CreditPurchaseRecord_totalAmount_positive",
		'Add check "CreditPurchaseRecord_totalAmount_positive"',
		`ALTER TABLE "CreditPurchaseRecord" ADD CONSTRAINT "CreditPurchaseRecord_totalAmount_positive" CHECK (("totalAmount" > (0)::numeric))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditPurchaseRecord_totalAmount_positive') AS ok",
		"additive",
	),
	raw(
		"check.CreditRefundRecord_amount_positive",
		'Add check "CreditRefundRecord_amount_positive"',
		`ALTER TABLE "CreditRefundRecord" ADD CONSTRAINT "CreditRefundRecord_amount_positive" CHECK ((amount > (0)::numeric))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditRefundRecord_amount_positive') AS ok",
		"additive",
	),
	raw(
		"check.CreditStatementCharge_amount_positive",
		'Add check "CreditStatementCharge_amount_positive"',
		`ALTER TABLE "CreditStatementCharge" ADD CONSTRAINT "CreditStatementCharge_amount_positive" CHECK ((amount > (0)::numeric))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditStatementCharge_amount_positive') AS ok",
		"additive",
	),
	raw(
		"check.MonthlyBudget_values_check",
		'Add check "MonthlyBudget_values_check"',
		`ALTER TABLE "MonthlyBudget" ADD CONSTRAINT "MonthlyBudget_values_check" CHECK ((((((source)::text = 'UNCATEGORIZED'::text) AND (amount >= (0)::numeric)) OR (((source)::text <> 'UNCATEGORIZED'::text) AND (amount > (0)::numeric))) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND ((source)::text = ANY ((ARRAY['TAG'::character varying, 'STATEMENTS'::character varying, 'CUSTOM'::character varying, 'RESERVE'::character varying, 'UNCATEGORIZED'::character varying])::text[])) AND (((source)::text = 'TAG'::text) = ("categoryId" IS NOT NULL)) AND (("startMonth")::text ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text) AND (("endMonth" IS NULL) OR ((("endMonth")::text ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text) AND (("endMonth")::text >= ("startMonth")::text)))))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MonthlyBudget_values_check') AS ok",
		"additive",
	),
	raw(
		"check.AccountTransfer_status_check",
		'Add check "AccountTransfer_status_check"',
		`ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_status_check" CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'DECLINED'::character varying, 'CANCELLED'::character varying])::text[])))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountTransfer_status_check') AS ok",
		"additive",
	),
	raw(
		"check.AccountTransfer_distinct_users",
		'Add check "AccountTransfer_distinct_users"',
		`ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_distinct_users" CHECK ((("senderId")::text <> ("recipientId")::text))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountTransfer_distinct_users') AS ok",
		"additive",
	),
	raw(
		"check.PushDevice_platform_check",
		'Add check "PushDevice_platform_check"',
		`ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_platform_check" CHECK (((platform)::text = ANY ((ARRAY['WEB'::character varying, 'ANDROID'::character varying, 'IOS'::character varying])::text[])))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushDevice_platform_check') AS ok",
		"additive",
	),
	raw(
		"check.NotificationDelivery_status_check",
		'Add check "NotificationDelivery_status_check"',
		`ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_status_check" CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SENT'::character varying, 'SKIPPED'::character varying])::text[])))`,
		"SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationDelivery_status_check') AS ok",
		"additive",
	),
	raw(
		"view.CreditRefundEffect",
		'Create view "CreditRefundEffect"',
		`CREATE VIEW public."CreditRefundEffect" AS  SELECT r.amount,
    r."cancellationEligible",
    r."createdAt",
    r."creditDate",
    r.id,
    r.policy,
    r."purchaseId",
    r."statementId",
    r."updatedAt",
    r."deletedAt",
    r."externalId",
    r."time",
        CASE
            WHEN r."cancellationEligible" AND r.policy = 'CANCEL_FUTURE_INSTALLMENTS'::"CreditRefundPolicy" AND r.amount = p."totalAmount" AND (( SELECT count(*) AS count
               FROM "CreditRefundRecord" x
              WHERE x."purchaseId"::text = r."purchaseId"::text AND x."deletedAt" IS NULL)) = 1 THEN COALESCE(( SELECT sum(plan.amount) AS sum
               FROM "CreditInstallmentPlan" plan
                 LEFT JOIN "CreditInstallmentRecord" i ON i."purchaseId"::text = plan."purchaseId"::text AND i.number = plan.number
                 LEFT JOIN "CreditCardStatement" s ON s.id::text = i."statementId"::text
              WHERE plan."purchaseId"::text = p.id::text AND NOT COALESCE(i."isSettled", false) AND i."settledByPurchaseId" IS NULL AND COALESCE(s."statementDate", plan."statementDate", credit_cycle_date(p."purchaseDate", plan.number::integer, c."statementDay"::integer)) > cs."statementDate"), 0::numeric)
            ELSE 0::numeric
        END AS "canceledAmount"
   FROM "CreditRefundRecord" r
     JOIN "CreditPurchaseRecord" p ON p.id::text = r."purchaseId"::text
     JOIN "CreditCard" c ON c.id::text = p."creditCardId"::text
     JOIN "CreditCardStatement" cs ON cs.id::text = r."statementId"::text
  WHERE r."deletedAt" IS NULL AND r."creditDate" <= CURRENT_DATE;`,
		"SELECT to_regclass('public.\"CreditRefundEffect\"') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"view.CreditConsumption",
		'Create view "CreditConsumption"',
		`CREATE VIEW public."CreditConsumption" AS  SELECT p.id,
    p.id AS "purchaseId",
    'INSTALLMENT'::text AS "entryKind",
    p."userId",
    p."creditCardId",
    i."statementId",
    p.description,
    p."storeName",
    p."purchaseDate",
    i."occurrenceDate",
    p."time",
    p."totalAmount" - COALESCE(( SELECT sum(r.amount) AS sum
           FROM "CreditRefundRecord" r
          WHERE r."purchaseId"::text = p.id::text AND r."deletedAt" IS NULL AND r."creditDate" <= CURRENT_DATE), 0::numeric) AS "totalAmount",
    ( SELECT count(*)::smallint AS count
           FROM "CreditInstallmentPlan" plan
          WHERE plan."purchaseId"::text = p.id::text) AS installments,
    1::smallint AS "currentInstallment",
    COALESCE(i.amount, ( SELECT "CreditInstallmentPlan".amount
           FROM "CreditInstallmentPlan"
          WHERE "CreditInstallmentPlan"."purchaseId"::text = p.id::text AND "CreditInstallmentPlan".number = 1)) AS "installmentAmount",
    i."hasImportedAmount",
    NULL::character varying AS "parentId",
    false AS "isRefund",
    false AS "isStatementCharge",
    NULL::character varying AS "refundOfPurchaseId",
    i."isSettled",
    i."settledByPurchaseId",
    p."feeAmount",
    p."feeDescription",
    p."refinancingFeeAmount",
    p."cashbackAccountId",
    p."cashbackAmount",
    p."cashbackYieldPeriod",
    p."cashbackYieldReferencePercentage",
    p."cashbackYieldReferenceRate",
    p."recurrenceId",
    p."recurrenceOccurrenceDate",
    p."externalId",
    p."createdAt",
    p."updatedAt"
   FROM "CreditPurchaseRecord" p
     LEFT JOIN LATERAL ( SELECT i_1.amount,
            i_1."createdAt",
            i_1."hasImportedAmount",
            i_1.id,
            i_1.number,
            i_1."occurrenceDate",
            i_1."purchaseId",
            i_1."settledByPurchaseId",
            i_1."statementId",
            i_1."updatedAt",
            i_1."isSettled"
           FROM "CreditInstallmentRecord" i_1
          WHERE i_1."purchaseId"::text = p.id::text
          ORDER BY i_1.number
         LIMIT 1) i ON true
UNION ALL
 SELECT r.id,
    p.id AS "purchaseId",
    'REFUND'::text AS "entryKind",
    p."userId",
    p."creditCardId",
    r."statementId",
    p.description,
    p."storeName",
    r."creditDate" AS "purchaseDate",
    r."creditDate" AS "occurrenceDate",
    r."time",
    - (r.amount - r."canceledAmount") AS "totalAmount",
    1::smallint AS installments,
    1::smallint AS "currentInstallment",
    - (r.amount - r."canceledAmount") AS "installmentAmount",
    r."externalId" IS NOT NULL AS "hasImportedAmount",
    NULL::character varying AS "parentId",
    true AS "isRefund",
    false AS "isStatementCharge",
    p.id AS "refundOfPurchaseId",
    false AS "isSettled",
    NULL::character varying AS "settledByPurchaseId",
    NULL::numeric AS "feeAmount",
    NULL::character varying AS "feeDescription",
    NULL::numeric AS "refinancingFeeAmount",
    NULL::character varying AS "cashbackAccountId",
    NULL::numeric AS "cashbackAmount",
    p."cashbackYieldPeriod",
    p."cashbackYieldReferencePercentage",
    p."cashbackYieldReferenceRate",
    NULL::character varying AS "recurrenceId",
    NULL::date AS "recurrenceOccurrenceDate",
    r."externalId",
    r."createdAt",
    GREATEST(r."updatedAt", p."updatedAt") AS "updatedAt"
   FROM "CreditRefundEffect" r
     JOIN "CreditPurchaseRecord" p ON p.id::text = r."purchaseId"::text
UNION ALL
 SELECT ch.id,
    NULL::character varying AS "purchaseId",
    'CHARGE'::text AS "entryKind",
    a."userId",
    s."creditCardId",
    ch."statementId",
    ch.description,
    NULL::character varying AS "storeName",
    ch."chargeDate" AS "purchaseDate",
    ch."chargeDate" AS "occurrenceDate",
    ch."time",
    ch.amount AS "totalAmount",
    1::smallint AS installments,
    1::smallint AS "currentInstallment",
    ch.amount AS "installmentAmount",
    ch."externalId" IS NOT NULL AS "hasImportedAmount",
    NULL::character varying AS "parentId",
    false AS "isRefund",
    true AS "isStatementCharge",
    NULL::character varying AS "refundOfPurchaseId",
    ch."isSettled",
    ch."settledByPurchaseId",
    NULL::numeric AS "feeAmount",
    NULL::character varying AS "feeDescription",
    NULL::numeric AS "refinancingFeeAmount",
    NULL::character varying AS "cashbackAccountId",
    NULL::numeric AS "cashbackAmount",
    NULL::"CashbackYieldPeriod" AS "cashbackYieldPeriod",
    NULL::numeric AS "cashbackYieldReferencePercentage",
    NULL::numeric AS "cashbackYieldReferenceRate",
    NULL::character varying AS "recurrenceId",
    NULL::date AS "recurrenceOccurrenceDate",
    ch."externalId",
    ch."createdAt",
    ch."updatedAt"
   FROM "CreditStatementCharge" ch
     JOIN "CreditCardStatement" s ON s.id::text = ch."statementId"::text
     JOIN "CreditCard" c ON c.id::text = s."creditCardId"::text
     JOIN "FinancialAccount" a ON a.id::text = c."financialAccountId"::text;`,
		"SELECT to_regclass('public.\"CreditConsumption\"') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"view.CreditEntry",
		'Create view "CreditEntry"',
		`CREATE VIEW public."CreditEntry" AS  SELECT i.id,
    p.id AS "purchaseId",
    'INSTALLMENT'::text AS "entryKind",
    p."userId",
    p."creditCardId",
    i."statementId",
    p.description,
    p."storeName",
    p."purchaseDate",
    i."occurrenceDate",
    p."time",
    p."totalAmount",
    ( SELECT count(*)::smallint AS count
           FROM "CreditInstallmentPlan" plan
          WHERE plan."purchaseId"::text = p.id::text) AS installments,
    i.number AS "currentInstallment",
    i.amount AS "installmentAmount",
    i."hasImportedAmount",
        CASE
            WHEN i.id::text = p.id::text THEN NULL::character varying
            ELSE p.id
        END AS "parentId",
    false AS "isRefund",
    false AS "isStatementCharge",
    NULL::character varying AS "refundOfPurchaseId",
    i."isSettled",
    i."settledByPurchaseId",
    p."feeAmount",
    p."feeDescription",
    p."refinancingFeeAmount",
        CASE
            WHEN i.id::text = p.id::text THEN p."cashbackAccountId"
            ELSE NULL::character varying
        END AS "cashbackAccountId",
        CASE
            WHEN i.id::text = p.id::text THEN p."cashbackAmount"
            ELSE NULL::numeric
        END AS "cashbackAmount",
    p."cashbackYieldPeriod",
    p."cashbackYieldReferencePercentage",
    p."cashbackYieldReferenceRate",
    p."recurrenceId",
    p."recurrenceOccurrenceDate",
    p."externalId",
    i."createdAt",
    GREATEST(i."updatedAt", p."updatedAt") AS "updatedAt"
   FROM "CreditInstallmentRecord" i
     JOIN "CreditPurchaseRecord" p ON p.id::text = i."purchaseId"::text
     JOIN "CreditCardStatement" s ON s.id::text = i."statementId"::text
  WHERE NOT (EXISTS ( SELECT 1
           FROM "CreditRefundEffect" r
             JOIN "CreditCardStatement" rs ON rs.id::text = r."statementId"::text
          WHERE r."purchaseId"::text = p.id::text AND r."canceledAmount" > 0::numeric AND s."statementDate" > rs."statementDate" AND NOT i."isSettled" AND i."settledByPurchaseId" IS NULL))
UNION ALL
 SELECT r.id,
    p.id AS "purchaseId",
    'REFUND'::text AS "entryKind",
    p."userId",
    p."creditCardId",
    r."statementId",
    p.description,
    p."storeName",
    r."creditDate" AS "purchaseDate",
    r."creditDate" AS "occurrenceDate",
    r."time",
    - r.amount AS "totalAmount",
    1::smallint AS installments,
    1::smallint AS "currentInstallment",
    - (r.amount - r."canceledAmount") AS "installmentAmount",
    r."externalId" IS NOT NULL AS "hasImportedAmount",
    NULL::character varying AS "parentId",
    true AS "isRefund",
    false AS "isStatementCharge",
    p.id AS "refundOfPurchaseId",
    false AS "isSettled",
    NULL::character varying AS "settledByPurchaseId",
    NULL::numeric AS "feeAmount",
    NULL::character varying AS "feeDescription",
    NULL::numeric AS "refinancingFeeAmount",
    NULL::character varying AS "cashbackAccountId",
    NULL::numeric AS "cashbackAmount",
    p."cashbackYieldPeriod",
    p."cashbackYieldReferencePercentage",
    p."cashbackYieldReferenceRate",
    NULL::character varying AS "recurrenceId",
    NULL::date AS "recurrenceOccurrenceDate",
    r."externalId",
    r."createdAt",
    GREATEST(r."updatedAt", p."updatedAt") AS "updatedAt"
   FROM "CreditRefundEffect" r
     JOIN "CreditPurchaseRecord" p ON p.id::text = r."purchaseId"::text
UNION ALL
 SELECT ch.id,
    NULL::character varying AS "purchaseId",
    'CHARGE'::text AS "entryKind",
    a."userId",
    s."creditCardId",
    ch."statementId",
    ch.description,
    NULL::character varying AS "storeName",
    ch."chargeDate" AS "purchaseDate",
    ch."chargeDate" AS "occurrenceDate",
    ch."time",
    ch.amount AS "totalAmount",
    1::smallint AS installments,
    1::smallint AS "currentInstallment",
    ch.amount AS "installmentAmount",
    ch."externalId" IS NOT NULL AS "hasImportedAmount",
    NULL::character varying AS "parentId",
    false AS "isRefund",
    true AS "isStatementCharge",
    NULL::character varying AS "refundOfPurchaseId",
    ch."isSettled",
    ch."settledByPurchaseId",
    NULL::numeric AS "feeAmount",
    NULL::character varying AS "feeDescription",
    NULL::numeric AS "refinancingFeeAmount",
    NULL::character varying AS "cashbackAccountId",
    NULL::numeric AS "cashbackAmount",
    NULL::"CashbackYieldPeriod" AS "cashbackYieldPeriod",
    NULL::numeric AS "cashbackYieldReferencePercentage",
    NULL::numeric AS "cashbackYieldReferenceRate",
    NULL::character varying AS "recurrenceId",
    NULL::date AS "recurrenceOccurrenceDate",
    ch."externalId",
    ch."createdAt",
    ch."updatedAt"
   FROM "CreditStatementCharge" ch
     JOIN "CreditCardStatement" s ON s.id::text = ch."statementId"::text
     JOIN "CreditCard" c ON c.id::text = s."creditCardId"::text
     JOIN "FinancialAccount" a ON a.id::text = c."financialAccountId"::text;`,
		"SELECT to_regclass('public.\"CreditEntry\"') IS NOT NULL AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.BalanceAdjustment",
		'Create trigger "zaimu_ownership_guard" on "BalanceAdjustment"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."BalanceAdjustment" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"BalanceAdjustment\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.Category",
		'Create trigger "zaimu_ownership_guard" on "Category"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."Category" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"Category\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditBookTombstone",
		'Create trigger "zaimu_ownership_guard" on "CreditBookTombstone"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditBookTombstone" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditBookTombstone\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditCard",
		'Create trigger "zaimu_ownership_guard" on "CreditCard"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditCard" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditCard\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditCardHistory",
		'Create trigger "zaimu_ownership_guard" on "CreditCardHistory"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditCardHistory" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditCardHistory\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditCardImport",
		'Create trigger "zaimu_ownership_guard" on "CreditCardImport"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditCardImport" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditCardImport\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditCardImportItem",
		'Create trigger "zaimu_ownership_guard" on "CreditCardImportItem"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditCardImportItem" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditCardImportItem\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditCardStatement",
		'Create trigger "zaimu_ownership_guard" on "CreditCardStatement"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditCardStatement" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditCardStatement\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditEntryReference",
		'Create trigger "zaimu_ownership_guard" on "CreditEntryReference"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditEntryReference" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditEntryReference\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.CreditInstallmentPlan_integrity.CreditInstallmentPlan",
		'Create trigger "CreditInstallmentPlan_integrity" on "CreditInstallmentPlan"',
		`CREATE CONSTRAINT TRIGGER "CreditInstallmentPlan_integrity" AFTER INSERT OR DELETE OR UPDATE ON public."CreditInstallmentPlan" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'CreditInstallmentPlan_integrity' AND tgrelid = 'public.\"CreditInstallmentPlan\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditInstallmentPlan",
		'Create trigger "zaimu_ownership_guard" on "CreditInstallmentPlan"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditInstallmentPlan" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditInstallmentPlan\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.CreditInstallmentRecord_integrity.CreditInstallmentRecord",
		'Create trigger "CreditInstallmentRecord_integrity" on "CreditInstallmentRecord"',
		`CREATE CONSTRAINT TRIGGER "CreditInstallmentRecord_integrity" AFTER INSERT OR UPDATE ON public."CreditInstallmentRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'CreditInstallmentRecord_integrity' AND tgrelid = 'public.\"CreditInstallmentRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditInstallmentRecord",
		'Create trigger "zaimu_ownership_guard" on "CreditInstallmentRecord"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditInstallmentRecord" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditInstallmentRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditPurchaseHistory",
		'Create trigger "zaimu_ownership_guard" on "CreditPurchaseHistory"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditPurchaseHistory" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditPurchaseHistory\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditPurchaseImportIdentity",
		'Create trigger "zaimu_ownership_guard" on "CreditPurchaseImportIdentity"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditPurchaseImportIdentity" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditPurchaseImportIdentity\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.CreditPurchaseRecord_integrity.CreditPurchaseRecord",
		'Create trigger "CreditPurchaseRecord_integrity" on "CreditPurchaseRecord"',
		`CREATE CONSTRAINT TRIGGER "CreditPurchaseRecord_integrity" AFTER INSERT OR UPDATE ON public."CreditPurchaseRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'CreditPurchaseRecord_integrity' AND tgrelid = 'public.\"CreditPurchaseRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.RecurrencePurchaseDeleted.CreditPurchaseRecord",
		'Create trigger "RecurrencePurchaseDeleted" on "CreditPurchaseRecord"',
		`CREATE TRIGGER "RecurrencePurchaseDeleted" BEFORE DELETE ON public."CreditPurchaseRecord" FOR EACH ROW EXECUTE FUNCTION "markDeletedRecurrencePurchase"()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'RecurrencePurchaseDeleted' AND tgrelid = 'public.\"CreditPurchaseRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditPurchaseRecord",
		'Create trigger "zaimu_ownership_guard" on "CreditPurchaseRecord"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditPurchaseRecord" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditPurchaseRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.CreditRefundRecord_integrity.CreditRefundRecord",
		'Create trigger "CreditRefundRecord_integrity" on "CreditRefundRecord"',
		`CREATE CONSTRAINT TRIGGER "CreditRefundRecord_integrity" AFTER INSERT OR UPDATE ON public."CreditRefundRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'CreditRefundRecord_integrity' AND tgrelid = 'public.\"CreditRefundRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditRefundRecord",
		'Create trigger "zaimu_ownership_guard" on "CreditRefundRecord"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditRefundRecord" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditRefundRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditRefundReview",
		'Create trigger "zaimu_ownership_guard" on "CreditRefundReview"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditRefundReview" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditRefundReview\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.CreditStatementCharge",
		'Create trigger "zaimu_ownership_guard" on "CreditStatementCharge"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."CreditStatementCharge" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"CreditStatementCharge\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.DebtPurchaseLink",
		'Create trigger "zaimu_ownership_guard" on "DebtPurchaseLink"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."DebtPurchaseLink" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"DebtPurchaseLink\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.DebtSplit",
		'Create trigger "zaimu_ownership_guard" on "DebtSplit"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."DebtSplit" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"DebtSplit\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.DebtSplitParticipant",
		'Create trigger "zaimu_ownership_guard" on "DebtSplitParticipant"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."DebtSplitParticipant" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"DebtSplitParticipant\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.DebtTransactionLink",
		'Create trigger "zaimu_ownership_guard" on "DebtTransactionLink"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."DebtTransactionLink" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"DebtTransactionLink\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.DetachedRewardCredit",
		'Create trigger "zaimu_ownership_guard" on "DetachedRewardCredit"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."DetachedRewardCredit" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"DetachedRewardCredit\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.FinancialAccount",
		'Create trigger "zaimu_ownership_guard" on "FinancialAccount"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."FinancialAccount" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"FinancialAccount\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.FinancialAccountYield",
		'Create trigger "zaimu_ownership_guard" on "FinancialAccountYield"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."FinancialAccountYield" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"FinancialAccountYield\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.FinancialAccountYieldRateHistory",
		'Create trigger "zaimu_ownership_guard" on "FinancialAccountYieldRateHistory"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."FinancialAccountYieldRateHistory" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"FinancialAccountYieldRateHistory\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.FinancialInstitution_refund_policy.FinancialInstitution",
		'Create trigger "FinancialInstitution_refund_policy" on "FinancialInstitution"',
		`CREATE TRIGGER "FinancialInstitution_refund_policy" BEFORE UPDATE OF "creditRefundPolicy" ON public."FinancialInstitution" FOR EACH ROW EXECUTE FUNCTION enforce_credit_refund_policy()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'FinancialInstitution_refund_policy' AND tgrelid = 'public.\"FinancialInstitution\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.LoanPayment",
		'Create trigger "zaimu_ownership_guard" on "LoanPayment"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."LoanPayment" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"LoanPayment\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.OpenFinanceBinding",
		'Create trigger "zaimu_ownership_guard" on "OpenFinanceBinding"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."OpenFinanceBinding" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"OpenFinanceBinding\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.OpenFinanceIdentity",
		'Create trigger "zaimu_ownership_guard" on "OpenFinanceIdentity"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."OpenFinanceIdentity" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"OpenFinanceIdentity\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.OpenFinanceRecord",
		'Create trigger "zaimu_ownership_guard" on "OpenFinanceRecord"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."OpenFinanceRecord" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"OpenFinanceRecord\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.TrackUpgradeRecurrenceDelete.Recurrence",
		'Create trigger "TrackUpgradeRecurrenceDelete" on "Recurrence"',
		`CREATE TRIGGER "TrackUpgradeRecurrenceDelete" BEFORE DELETE ON public."Recurrence" FOR EACH ROW EXECUTE FUNCTION "trackUpgradeRecurrence"()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'TrackUpgradeRecurrenceDelete' AND tgrelid = 'public.\"Recurrence\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.Recurrence",
		'Create trigger "zaimu_ownership_guard" on "Recurrence"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."Recurrence" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"Recurrence\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.RecurrenceHistory",
		'Create trigger "zaimu_ownership_guard" on "RecurrenceHistory"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."RecurrenceHistory" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"RecurrenceHistory\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.RecurrenceOccurrence",
		'Create trigger "zaimu_ownership_guard" on "RecurrenceOccurrence"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."RecurrenceOccurrence" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"RecurrenceOccurrence\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.RewardsAccount",
		'Create trigger "zaimu_ownership_guard" on "RewardsAccount"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."RewardsAccount" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"RewardsAccount\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TagAssignment",
		'Create trigger "zaimu_ownership_guard" on "TagAssignment"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TagAssignment" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TagAssignment\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.RecurrenceTransactionDeleted.Transaction",
		'Create trigger "RecurrenceTransactionDeleted" on "Transaction"',
		`CREATE TRIGGER "RecurrenceTransactionDeleted" BEFORE DELETE ON public."Transaction" FOR EACH ROW EXECUTE FUNCTION "markDeletedRecurrenceTransaction"()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'RecurrenceTransactionDeleted' AND tgrelid = 'public.\"Transaction\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.Transaction",
		'Create trigger "zaimu_ownership_guard" on "Transaction"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."Transaction" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"Transaction\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TransactionExternalReference",
		'Create trigger "zaimu_ownership_guard" on "TransactionExternalReference"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TransactionExternalReference" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TransactionExternalReference\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TransactionHistory",
		'Create trigger "zaimu_ownership_guard" on "TransactionHistory"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TransactionHistory" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TransactionHistory\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TransactionImport",
		'Create trigger "zaimu_ownership_guard" on "TransactionImport"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TransactionImport" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TransactionImport\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TransactionImportItem",
		'Create trigger "zaimu_ownership_guard" on "TransactionImportItem"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TransactionImportItem" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TransactionImportItem\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TransactionImportTransferSuggestionRejection",
		'Create trigger "zaimu_ownership_guard" on "TransactionImportTransferSuggestionRejection"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TransactionImportTransferSuggestionRejection" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TransactionImportTransferSuggestionRejection\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.TransactionTransferSuggestionRejection",
		'Create trigger "zaimu_ownership_guard" on "TransactionTransferSuggestionRejection"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."TransactionTransferSuggestionRejection" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"TransactionTransferSuggestionRejection\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.UserFinancialInstitution",
		'Create trigger "zaimu_ownership_guard" on "UserFinancialInstitution"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."UserFinancialInstitution" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"UserFinancialInstitution\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"trigger.zaimu_ownership_guard.UserInstitutionProfileChange",
		'Create trigger "zaimu_ownership_guard" on "UserInstitutionProfileChange"',
		`CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR DELETE OR UPDATE ON public."UserInstitutionProfileChange" FOR EACH ROW EXECUTE FUNCTION zaimu_ownership_guard()`,
		"SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zaimu_ownership_guard' AND tgrelid = 'public.\"UserInstitutionProfileChange\"'::regclass) AS ok",
		"additive",
	),
	raw(
		"seed.taxDefinitions",
		"Seed initial tax catalog",
		file("./tax-definitions.sql"),
		`SELECT count(*) = 2 AS ok FROM "taxDefinitionVersion"`,
		"data",
		"taxDefinitions.initialCatalog.v1",
	),
	raw(
		"seed.referenceRateBootstrap",
		"Queue reference-rate backfill",
		file("./outbox-bootstrap.sql"),
		`SELECT count(*) = 2 AS ok FROM "OutboxEvent" WHERE "eventType" = 'command.reference-rate-fetch'`,
		"data",
	),
	raw(
		"invariant.creditCard.nubankCycleDefaults.v1",
		"Provide invariant creditCard.nubankCycleDefaults.v1",
		"SELECT 1",
		"SELECT true AS ok",
		"data",
		"creditCard.nubankCycleDefaults.v1",
	),
	raw(
		"invariant.creditPurchases.allowExcessRefunds.v1",
		"Provide invariant creditPurchases.allowExcessRefunds.v1",
		"SELECT 1",
		`SELECT position('Refunds exceed purchase total' in pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure)) = 0 AS ok`,
		"data",
		"creditPurchases.allowExcessRefunds.v1",
	),
	raw(
		"invariant.legacyYieldCalendar.frozen.v1",
		"Provide invariant legacyYieldCalendar.frozen.v1",
		"SELECT 1",
		"SELECT true AS ok",
		"data",
		"legacyYieldCalendar.frozen.v1",
	),
	raw(
		"invariant.monthlyBudget.uncategorizedValues.v1",
		"Provide invariant monthlyBudget.uncategorizedValues.v1",
		"SELECT 1",
		"SELECT true AS ok",
		"data",
		"monthlyBudget.uncategorizedValues.v1",
	),
	raw(
		"invariant.monthlyBudget.values.v1",
		"Provide invariant monthlyBudget.values.v1",
		"SELECT 1",
		"SELECT true AS ok",
		"data",
		"monthlyBudget.values.v1",
	),
	raw(
		"invariant.universalInstitutions.legacyPreserved.v1",
		"Provide invariant universalInstitutions.legacyPreserved.v1",
		"SELECT 1",
		"SELECT true AS ok",
		"data",
		"universalInstitutions.legacyPreserved.v1",
	),
];
