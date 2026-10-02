LOCK TABLE "Recurrence", "Transaction", "CreditPurchaseRecord", "DebtSplit", "Salary", "Subscription", "RecurringPayment", "SalaryHistory", "SubscriptionHistory", "RecurringPaymentHistory" IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE application_recurrence_totals ON COMMIT DROP AS
SELECT (SELECT count(*) FROM "Transaction") AS transactions,
 (SELECT COALESCE(sum("amount"),0) FROM "Transaction") AS transaction_amount,
 (SELECT count(*) FROM "CreditPurchaseRecord") AS purchases,
 (SELECT COALESCE(sum("totalAmount"),0) FROM "CreditPurchaseRecord") AS purchase_amount,
 (SELECT count(*) FROM "RecurrenceOccurrence") AS occurrences,
 (SELECT count(*) FROM "RecurrenceOccurrence" WHERE "deletedAt" IS NOT NULL) AS tombstones;
DO $verify$
DECLARE source_table text; mismatch boolean;
BEGIN
 FOREACH source_table IN ARRAY ARRAY['Salary','Subscription','RecurringPayment','SalaryHistory','SubscriptionHistory','RecurringPaymentHistory'] LOOP
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I t LEFT JOIN "ApplicationUpgradeArchive" a ON a."source"=%L AND a."recordId"=t."id" WHERE a."recordId" IS NULL OR a."original"::jsonb <> to_jsonb(t))',source_table,source_table) INTO mismatch;
  IF mismatch THEN RAISE EXCEPTION 'Legacy audit mismatch: %; preserve originals and review',source_table; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM "Transaction" WHERE "salaryId" IS NOT NULL OR "subscriptionId" IS NOT NULL) OR EXISTS (SELECT 1 FROM "DebtSplit" WHERE "subscriptionId" IS NOT NULL) THEN
  RAISE EXCEPTION 'Unconverted recurrence references; removal aborted';
 END IF;
 IF EXISTS (SELECT 1 FROM "Recurrence" r WHERE r."legacyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ApplicationUpgradeRecurrence" m WHERE m."userId"=r."userId" AND m."source"=r."legacySource" AND m."legacyId"=r."legacyId" AND m."recurrenceId"=r."id" AND m."deletedAt" IS NULL)) THEN
  RAISE EXCEPTION 'Missing upgrade identity; removal aborted';
 END IF;
END $verify$;
ALTER TABLE "CreditPurchaseRecord" RENAME COLUMN "subscriptionId" TO "recurrenceId";
ALTER TABLE "CreditPurchaseRecord" RENAME COLUMN "subscriptionOccurrenceDate" TO "recurrenceOccurrenceDate";
ALTER TABLE "CreditPurchaseRecord" RENAME CONSTRAINT "CreditPurchaseRecord_subscriptionId_fkey" TO "CreditPurchaseRecord_recurrenceId_fkey";
ALTER INDEX "CreditPurchaseRecord_subscription_occurrence_key" RENAME TO "CreditPurchaseRecord_recurrence_occurrence_key";
ALTER VIEW "CreditEntry" RENAME COLUMN "subscriptionId" TO "recurrenceId";
ALTER VIEW "CreditEntry" RENAME COLUMN "subscriptionOccurrenceDate" TO "recurrenceOccurrenceDate";
ALTER VIEW "CreditConsumption" RENAME COLUMN "subscriptionId" TO "recurrenceId";
ALTER VIEW "CreditConsumption" RENAME COLUMN "subscriptionOccurrenceDate" TO "recurrenceOccurrenceDate";
-- PL/pgSQL bodies retain textual column names after ALTER TABLE.
DO $trigger$
DECLARE definition text;
BEGIN
 IF to_regprocedure('enforce_credit_purchase_integrity()') IS NOT NULL THEN
  SELECT pg_get_functiondef('enforce_credit_purchase_integrity()'::regprocedure) INTO definition;
  EXECUTE replace(replace(definition, 'subscriptionOccurrenceDate', 'recurrenceOccurrenceDate'), 'subscriptionId', 'recurrenceId');
 END IF;
END $trigger$;
ALTER TABLE "DebtSplit" DROP COLUMN "subscriptionId";
ALTER TABLE "DebtSplit" RENAME COLUMN "recurringPaymentId" TO "recurrenceId";
ALTER TABLE "DebtSplit" RENAME CONSTRAINT "DebtSplit_recurringPaymentId_key" TO "DebtSplit_recurrenceId_key";
ALTER TABLE "DebtSplit" RENAME CONSTRAINT "DebtSplit_recurringPaymentId_fkey" TO "DebtSplit_recurrenceId_fkey";
ALTER TABLE "Transaction" DROP COLUMN "salaryId", DROP COLUMN "salaryOccurrenceDate", DROP COLUMN "subscriptionId", DROP COLUMN "subscriptionOccurrenceDate";
DROP TRIGGER "TrackUpgradeRecurrenceWrite" ON "Recurrence";
DROP TRIGGER "TrackUpgradeRecurrenceDelete" ON "Recurrence";
CREATE OR REPLACE FUNCTION "trackUpgradeRecurrence"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 UPDATE "ApplicationUpgradeRecurrence" SET "deletedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=OLD."userId" AND "recurrenceId"=OLD."id";
 RETURN OLD;
END $fn$;
CREATE TRIGGER "TrackUpgradeRecurrenceDelete" BEFORE DELETE ON "Recurrence" FOR EACH ROW EXECUTE FUNCTION "trackUpgradeRecurrence"();
ALTER TABLE "Recurrence" DROP COLUMN "legacySource", DROP COLUMN "legacyId";
DROP TABLE "SalaryHistory", "SubscriptionHistory", "RecurringPaymentHistory";
DROP TABLE "Salary", "Subscription", "RecurringPayment";
DO $totals$
BEGIN
 IF EXISTS (SELECT 1 FROM application_recurrence_totals t WHERE
 t.transactions<>(SELECT count(*) FROM "Transaction") OR t.transaction_amount<>(SELECT COALESCE(sum("amount"),0) FROM "Transaction") OR
 t.purchases<>(SELECT count(*) FROM "CreditPurchaseRecord") OR t.purchase_amount<>(SELECT COALESCE(sum("totalAmount"),0) FROM "CreditPurchaseRecord") OR
 t.occurrences<>(SELECT count(*) FROM "RecurrenceOccurrence") OR t.tombstones<>(SELECT count(*) FROM "RecurrenceOccurrence" WHERE "deletedAt" IS NOT NULL)) THEN
 RAISE EXCEPTION 'Recurrence cutover financial mismatch'; END IF;
END $totals$;
