LOCK TABLE "Debt", "DebtHistory", "DebtEvent", "DebtPerson" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE debt_ledger_before ON COMMIT DROP AS SELECT "id",to_jsonb(e) AS original FROM "DebtEvent" e;
INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original")
SELECT 'Debt',"id","userId",to_jsonb(d) FROM "Debt" d ON CONFLICT DO NOTHING;
INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original")
SELECT 'DebtHistory',h."id",d."userId",to_jsonb(h) FROM "DebtHistory" h JOIN "Debt" d ON d."id"=h."debtId" ON CONFLICT DO NOTHING;
DO $audit$
BEGIN
 IF EXISTS (SELECT 1 FROM "Debt" d LEFT JOIN "ApplicationUpgradeArchive" a ON a."source"='Debt' AND a."recordId"=d."id" WHERE a."userId" IS DISTINCT FROM d."userId" OR a."original"::jsonb IS DISTINCT FROM to_jsonb(d)) OR
 EXISTS (SELECT 1 FROM "DebtHistory" h LEFT JOIN "ApplicationUpgradeArchive" a ON a."source"='DebtHistory' AND a."recordId"=h."id" WHERE a."original"::jsonb IS DISTINCT FROM to_jsonb(h)) THEN
 RAISE EXCEPTION 'Debt archive mismatch'; END IF;
END $audit$;
INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original")
SELECT 'DebtEventUpgrade',"id","createdByUserId",to_jsonb(e) FROM "DebtEvent" e ON CONFLICT DO NOTHING;
ALTER TABLE "DebtEvent" ADD COLUMN "deletedAt" timestamp(3);
-- Legacy origins deleted through the current ledger must stay deleted after offline sync.
INSERT INTO "DebtEvent" ("id","debtPersonId","createdByUserId","kind","amount","effect","date","dueDate","description","createdAt","updatedAt","deletedAt")
SELECT d."id",p."id",d."userId",'ORIGIN',d."amount",CASE WHEN d."isOwedToMe" THEN d."amount" ELSE -d."amount" END,d."date",d."dueDate",d."description",d."createdAt",d."updatedAt",CURRENT_TIMESTAMP
FROM "Debt" d JOIN "DebtPerson" p ON p."userId"=d."userId" AND p."normalizedName"=lower(regexp_replace(trim(d."personName"),'\s+',' ','g')) WHERE NOT EXISTS(SELECT 1 FROM "DebtEvent" e WHERE e."id"=d."id");
INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original")
SELECT 'DebtSettlementProof',e."id",e."createdByUserId",json_build_object('eventId',e."id",'debtPersonId',e."debtPersonId",'amount',e."amount",'effect',e."effect",'date',e."date") FROM "DebtEvent" e WHERE e."kind"='MIGRATED_SETTLEMENT' ON CONFLICT DO NOTHING;
DROP TABLE "DebtHistory";
DROP TABLE "Debt";
DO $verify$
BEGIN
 IF EXISTS (SELECT 1 FROM debt_ledger_before b LEFT JOIN "DebtEvent" e ON e."id"=b."id" WHERE b.original IS DISTINCT FROM to_jsonb(e)-'deletedAt') OR
 EXISTS (SELECT 1 FROM "DebtEvent" e WHERE e."deletedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM debt_ledger_before b WHERE b."id"=e."id")) THEN
 RAISE EXCEPTION 'Debt ledger changed during cutover'; END IF;
END $verify$;
