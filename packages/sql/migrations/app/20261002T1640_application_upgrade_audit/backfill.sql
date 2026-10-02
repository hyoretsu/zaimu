LOCK TABLE "Recurrence", "Salary", "Subscription", "RecurringPayment" IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO "ApplicationUpgradeRecurrence" ("userId","source","legacyId","recurrenceId")
SELECT "userId","legacySource","legacyId","id" FROM "Recurrence"
WHERE "legacySource" IS NOT NULL AND "legacyId" IS NOT NULL;
-- Historic source tables retain schedules deleted after the first conversion.
-- Reproduce that migration's collision choices; never bind a deleted schedule to a new one.
WITH originals AS (
 SELECT "userId",'recurring'::text AS source,"id" AS "legacyId","id" AS destination FROM "RecurringPayment"
 UNION ALL
 SELECT s."userId",'subscription',s."id",CASE WHEN EXISTS (SELECT 1 FROM "RecurringPayment" r WHERE r."id"=s."id") THEN md5('subscription:'||s."id") ELSE s."id" END FROM "Subscription" s
 UNION ALL
 SELECT s."userId",'salary',s."id",CASE WHEN EXISTS (SELECT 1 FROM "RecurringPayment" r WHERE r."id"=s."id") OR EXISTS (SELECT 1 FROM "Subscription" r WHERE r."id"=s."id") THEN md5('salary:'||s."id") ELSE s."id" END FROM "Salary" s
)
INSERT INTO "ApplicationUpgradeRecurrence" ("userId","source","legacyId","recurrenceId","deletedAt")
SELECT "userId",source,"legacyId",destination,CURRENT_TIMESTAMP FROM originals
ON CONFLICT ("userId","source","legacyId") DO NOTHING;
DO $archive$
DECLARE source_table text;
BEGIN
 FOREACH source_table IN ARRAY ARRAY['Salary','Subscription','RecurringPayment','Debt','CreditPurchaseLegacyEntry'] LOOP
  EXECUTE format('INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original") SELECT %L,t."id",to_jsonb(t)->>''userId'',to_jsonb(t) FROM %I t ON CONFLICT DO NOTHING', source_table,source_table);
 END LOOP;
 INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original")
 SELECT 'SalaryHistory',h."id",s."userId",to_jsonb(h) FROM "SalaryHistory" h JOIN "Salary" s ON s."id"=h."salaryId"
 UNION ALL SELECT 'SubscriptionHistory',h."id",s."userId",to_jsonb(h) FROM "SubscriptionHistory" h JOIN "Subscription" s ON s."id"=h."subscriptionId"
 UNION ALL SELECT 'RecurringPaymentHistory',h."id",s."userId",to_jsonb(h) FROM "RecurringPaymentHistory" h JOIN "RecurringPayment" s ON s."id"=h."recurringPaymentId"
 UNION ALL SELECT 'DebtHistory',h."id",s."userId",to_jsonb(h) FROM "DebtHistory" h JOIN "Debt" s ON s."id"=h."debtId"
 ON CONFLICT DO NOTHING;
END $archive$;
CREATE FUNCTION "trackUpgradeRecurrence"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE "ApplicationUpgradeRecurrence" SET "deletedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=OLD."userId" AND "recurrenceId"=OLD."id";
  RETURN OLD;
 END IF;
 IF NEW."legacySource" IS NOT NULL AND NEW."legacyId" IS NOT NULL THEN
  INSERT INTO "ApplicationUpgradeRecurrence" ("userId","source","legacyId","recurrenceId")
  VALUES (NEW."userId",NEW."legacySource",NEW."legacyId",NEW."id")
  ON CONFLICT ("userId","source","legacyId") DO UPDATE SET "recurrenceId"=EXCLUDED."recurrenceId","updatedAt"=CURRENT_TIMESTAMP;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "TrackUpgradeRecurrenceWrite" AFTER INSERT OR UPDATE ON "Recurrence" FOR EACH ROW EXECUTE FUNCTION "trackUpgradeRecurrence"();
CREATE TRIGGER "TrackUpgradeRecurrenceDelete" BEFORE DELETE ON "Recurrence" FOR EACH ROW EXECUTE FUNCTION "trackUpgradeRecurrence"();
DO $verify$
BEGIN
 IF EXISTS (SELECT 1 FROM "Recurrence" r WHERE r."legacyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ApplicationUpgradeRecurrence" m WHERE m."userId"=r."userId" AND m."source"=r."legacySource" AND m."legacyId"=r."legacyId" AND m."recurrenceId"=r."id" AND m."deletedAt" IS NULL)) THEN
  RAISE EXCEPTION 'Upgrade recurrence provenance mismatch';
 END IF;
END $verify$;
