CREATE OR REPLACE FUNCTION enforce_credit_purchase_integrity() RETURNS trigger LANGUAGE plpgsql AS $integrity$
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
 (p."subscriptionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Recurrence" x WHERE x."id" = p."subscriptionId" AND x."userId" = owner_id)))) THEN RAISE EXCEPTION 'Purchase metadata belongs to another owner'; END IF;
 RETURN NULL;
END $integrity$;

LOCK TABLE "Salary", "Subscription", "RecurringPayment", "Transaction", "CreditPurchaseRecord", "DebtSplit", "TagAssignment" IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","interval","dayOfMonth","dayOfWeek","startDate","endDate","originFinancialAccountId","destinationFinancialAccountId","creditCardId","storeName","isActive","materializedThrough","legacySource","legacyId","createdAt","updatedAt")
SELECT p."id",p."userId",p."name",p."amount",CASE WHEN p."paymentMethod"='CREDIT' THEN 'CARD_PURCHASE' ELSE 'EXPENSE' END,
CASE p."frequency" WHEN 'DAILY' THEN 'DAY' WHEN 'WEEKLY' THEN 'WEEK' WHEN 'BIWEEKLY' THEN 'WEEK' WHEN 'YEARLY' THEN 'YEAR' ELSE 'MONTH' END,
CASE WHEN p."frequency"='BIWEEKLY' THEN 2 ELSE 1 END,p."dayOfMonth",p."dayOfWeek",p."startDate",p."endDate",
CASE WHEN p."paymentMethod"='CREDIT' THEN NULL ELSE p."financialAccountId" END,NULL,c."id",p."storeName",p."isActive",CURRENT_DATE-1,'recurring',p."id",p."createdAt",p."updatedAt"
FROM "RecurringPayment" p LEFT JOIN "CreditCard" c ON c."financialAccountId"=p."financialAccountId" AND p."paymentMethod"='CREDIT';
INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","interval","dayOfMonth","dayOfWeek","startDate","endDate","originFinancialAccountId","destinationFinancialAccountId","creditCardId","storeName","isActive","materializedThrough","legacySource","legacyId","createdAt","updatedAt")
SELECT CASE WHEN EXISTS (SELECT 1 FROM "Recurrence" r WHERE r."id"=s."id") THEN md5('subscription:'||s."id") ELSE s."id" END,s."userId",s."name",s."amount",CASE WHEN s."paymentMethod"='CREDIT' THEN 'CARD_PURCHASE' ELSE 'EXPENSE' END,
CASE s."frequency" WHEN 'DAILY' THEN 'DAY' WHEN 'WEEKLY' THEN 'WEEK' WHEN 'BIWEEKLY' THEN 'WEEK' WHEN 'YEARLY' THEN 'YEAR' ELSE 'MONTH' END,
CASE WHEN s."frequency"='BIWEEKLY' THEN 2 ELSE 1 END,s."billingDay",s."dayOfWeek",s."startDate",s."endDate",
CASE WHEN s."paymentMethod"='CREDIT' THEN NULL ELSE s."financialAccountId" END,NULL,c."id",s."storeName",s."isActive",s."materializedThrough",'subscription',s."id",s."createdAt",s."updatedAt"
FROM "Subscription" s LEFT JOIN "CreditCard" c ON c."financialAccountId"=s."financialAccountId" AND s."paymentMethod"='CREDIT';
INSERT INTO "Recurrence" ("id","userId","name","amount","movement","unit","interval","dayOfMonth","dayOfWeek","startDate","endDate","destinationFinancialAccountId","isActive","materializedThrough","legacySource","legacyId","createdAt","updatedAt")
SELECT CASE WHEN EXISTS (SELECT 1 FROM "Recurrence" r WHERE r."id"=s."id") THEN md5('salary:'||s."id") ELSE s."id" END,s."userId",s."source",s."amount",'INCOME',
CASE s."frequency" WHEN 'DAILY' THEN 'DAY' WHEN 'WEEKLY' THEN 'WEEK' WHEN 'BIWEEKLY' THEN 'WEEK' WHEN 'YEARLY' THEN 'YEAR' ELSE 'MONTH' END,
CASE WHEN s."frequency"='BIWEEKLY' THEN 2 ELSE 1 END,s."payDay",s."dayOfWeek",s."startDate",s."endDate",s."financialAccountId",s."isActive",s."materializedThrough",'salary',s."id",s."createdAt",s."updatedAt" FROM "Salary" s;
UPDATE "Transaction" t SET "recurrenceId"=r."id" FROM "Recurrence" r WHERE r."legacySource"='recurring' AND r."legacyId"=t."recurrenceId";
UPDATE "Transaction" t SET "recurrenceId"=r."id","recurrenceOccurrenceDate"=COALESCE(t."salaryOccurrenceDate",t."date"),"salaryId"=NULL,"salaryOccurrenceDate"=NULL FROM "Recurrence" r WHERE r."legacySource"='salary' AND r."legacyId"=t."salaryId";
UPDATE "Transaction" t SET "recurrenceId"=r."id","recurrenceOccurrenceDate"=COALESCE(t."subscriptionOccurrenceDate",t."date"),"subscriptionId"=NULL,"subscriptionOccurrenceDate"=NULL FROM "Recurrence" r WHERE r."legacySource"='subscription' AND r."legacyId"=t."subscriptionId";
UPDATE "Transaction" SET "recurrenceOccurrenceDate"="date" WHERE "recurrenceId" IS NOT NULL AND "recurrenceOccurrenceDate" IS NULL;
UPDATE "CreditPurchaseRecord" p SET "subscriptionId"=r."id" FROM "Recurrence" r WHERE r."legacySource"='subscription' AND r."legacyId"=p."subscriptionId";
UPDATE "DebtSplit" s SET "recurringPaymentId"=r."id" FROM "Recurrence" r WHERE r."legacySource"='recurring' AND r."legacyId"=s."recurringPaymentId";
UPDATE "DebtSplit" s SET "recurringPaymentId"=r."id","subscriptionId"=NULL FROM "Recurrence" r WHERE r."legacySource"='subscription' AND r."legacyId"=s."subscriptionId";
UPDATE "TagAssignment" a SET "entityId"=r."id","entityType"='RECURRENCE' FROM "Recurrence" r WHERE r."legacyId"=a."entityId" AND ((r."legacySource"='salary' AND a."entityType"='SALARY') OR (r."legacySource"='subscription' AND a."entityType"='SUBSCRIPTION') OR (r."legacySource"='recurring' AND a."entityType"='RECURRING_PAYMENT'));
INSERT INTO "RecurrenceHistory" ("id","recurrenceId","field","oldValue","newValue","changedAt")
SELECT md5('recurring:'||h."id"),r."id",h."field",h."oldValue",h."newValue",h."changedAt" FROM "RecurringPaymentHistory" h JOIN "Recurrence" r ON r."legacySource"='recurring' AND r."legacyId"=h."recurringPaymentId"
UNION ALL SELECT md5('salary:'||h."id"),r."id",h."field",h."oldValue",h."newValue",h."changedAt" FROM "SalaryHistory" h JOIN "Recurrence" r ON r."legacySource"='salary' AND r."legacyId"=h."salaryId"
UNION ALL SELECT md5('subscription:'||h."id"),r."id",h."field",h."oldValue",h."newValue",h."changedAt" FROM "SubscriptionHistory" h JOIN "Recurrence" r ON r."legacySource"='subscription' AND r."legacyId"=h."subscriptionId";
INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","transactionId") SELECT "recurrenceId","recurrenceOccurrenceDate","id" FROM "Transaction" WHERE "recurrenceId" IS NOT NULL;
INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","purchaseId") SELECT "subscriptionId",COALESCE("subscriptionOccurrenceDate","purchaseDate"),"id" FROM "CreditPurchaseRecord" WHERE "subscriptionId" IS NOT NULL
ON CONFLICT ("recurrenceId","date") DO UPDATE SET "purchaseId"=EXCLUDED."purchaseId";
DO $$ BEGIN
 IF (SELECT count(*) FROM "Recurrence") <> (SELECT count(*) FROM "RecurringPayment")+(SELECT count(*) FROM "Salary")+(SELECT count(*) FROM "Subscription") THEN RAISE EXCEPTION 'Recurrence migration count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM "Transaction" t LEFT JOIN "Recurrence" r ON r."id"=t."recurrenceId" WHERE t."recurrenceId" IS NOT NULL AND r."id" IS NULL) THEN RAISE EXCEPTION 'Unresolved recurrence transaction'; END IF;
 IF EXISTS (SELECT 1 FROM "CreditPurchaseRecord" p LEFT JOIN "Recurrence" r ON r."id"=p."subscriptionId" WHERE p."subscriptionId" IS NOT NULL AND r."id" IS NULL) THEN RAISE EXCEPTION 'Unresolved recurrence purchase'; END IF;
END $$;
-- Flush deferred FK checks from the backfill before creating triggers or altering tables.
SET CONSTRAINTS ALL IMMEDIATE;
-- Legacy rows remain read-only archives for verification and rollback. Runtime uses Recurrence only.
CREATE FUNCTION "markDeletedRecurrenceTransaction"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE "RecurrenceOccurrence" SET "deletedAt"=CURRENT_TIMESTAMP WHERE "transactionId"=OLD."id";
 RETURN OLD;
END $$;
CREATE TRIGGER "RecurrenceTransactionDeleted" BEFORE DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION "markDeletedRecurrenceTransaction"();
CREATE FUNCTION "markDeletedRecurrencePurchase"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE "RecurrenceOccurrence" SET "deletedAt"=CURRENT_TIMESTAMP WHERE "purchaseId"=OLD."id";
 RETURN OLD;
END $$;
CREATE TRIGGER "RecurrencePurchaseDeleted" BEFORE DELETE ON "CreditPurchaseRecord" FOR EACH ROW EXECUTE FUNCTION "markDeletedRecurrencePurchase"();
