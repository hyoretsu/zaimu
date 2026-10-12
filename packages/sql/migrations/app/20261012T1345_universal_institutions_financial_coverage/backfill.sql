-- Legacy institutions remain private. Global rule adoption requires an explicit date.
INSERT INTO "FinancialInstitutionProfile" ("id", "institutionId", "name", "isDefault")
SELECT cuid2(), i."id", 'Padrão', true FROM "FinancialInstitution" i
WHERE NOT EXISTS (SELECT 1 FROM "FinancialInstitutionProfile" p WHERE p."institutionId" = i."id" AND p."isDefault");
INSERT INTO "UserFinancialInstitution" ("id", "userId", "institutionId")
SELECT cuid2(), i."userId", i."id" FROM "FinancialInstitution" i WHERE i."userId" IS NOT NULL
ON CONFLICT ("userId", "institutionId") DO NOTHING;
-- Existing institution policies retain their values and dates in the private default profile.
UPDATE "FinancialInstitutionYieldPolicy" y SET "profileId" = p."id"
FROM "FinancialInstitutionProfile" p WHERE p."institutionId" = y."financialInstitutionId" AND p."isDefault" AND y."profileId" IS NULL;
-- Infer country only when the currency has exactly one recorded country association.
UPDATE "FinancialAccount" a SET "countryCode" = c."countryCode"
FROM (SELECT "currency", min("countryCode") AS "countryCode" FROM "YieldCalendarCurrency" GROUP BY "currency" HAVING count(*) = 1) c
WHERE a."currency" = c."currency" AND a."countryCode" IS NULL;
-- Preserve every existing administrator event as an override; never claim a full generated year.
INSERT INTO "YieldCalendarOverride" ("id", "countryCode", "date", "name", "action")
SELECT cuid2(), "countryCode", "date", "name", 'INCLUDE' FROM "YieldCalendarHoliday"
ON CONFLICT ("countryCode", "date") DO NOTHING;
INSERT INTO "YieldCalendarCoverage" ("countryCode", "year", "status", "source", "sourceVersion")
SELECT DISTINCT "countryCode", extract(year FROM "date")::integer, 'MANUAL_PENDING', 'ADMIN', 'legacy' FROM "YieldCalendarHoliday"
ON CONFLICT ("countryCode", "year") DO NOTHING;
INSERT INTO "CurrencyCountryAssociation" ("id", "countryCode", "currency", "source", "sourceVersion")
SELECT cuid2(), "countryCode", "currency", 'ADMIN', 'legacy' FROM "YieldCalendarCurrency";
