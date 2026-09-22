CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.normalize_search(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
RETURN lower(public.unaccent('public.unaccent', coalesce(value, '')));

ALTER TABLE "public"."Transaction" ADD COLUMN "userId" VARCHAR(36);
ALTER TABLE "public"."CreditPurchase" ADD COLUMN "userId" VARCHAR(36);

UPDATE "public"."Transaction" transaction
SET "userId" = COALESCE(
    (SELECT account."userId" FROM "public"."FinancialAccount" account WHERE account."id" = transaction."originFinancialAccountId"),
    (SELECT account."userId" FROM "public"."FinancialAccount" account WHERE account."id" = transaction."destinationFinancialAccountId"),
    (SELECT account."userId" FROM "public"."CreditCardStatement" statement
      JOIN "public"."CreditCard" card ON card."id" = statement."creditCardId"
      JOIN "public"."FinancialAccount" account ON account."id" = card."financialAccountId"
      WHERE statement."id" = transaction."creditCardStatementId"),
    (SELECT recurring."userId" FROM "public"."RecurringPayment" recurring WHERE recurring."id" = transaction."recurrenceId"),
    (SELECT salary."userId" FROM "public"."Salary" salary WHERE salary."id" = transaction."salaryId"),
    (SELECT subscription."userId" FROM "public"."Subscription" subscription WHERE subscription."id" = transaction."subscriptionId")
);

UPDATE "public"."CreditPurchase" purchase
SET "userId" = account."userId"
FROM "public"."CreditCardStatement" statement
JOIN "public"."CreditCard" card ON card."id" = statement."creditCardId"
JOIN "public"."FinancialAccount" account ON account."id" = card."financialAccountId"
WHERE statement."id" = purchase."statementId";

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "public"."Transaction" WHERE "userId" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill Transaction.userId';
    END IF;
    IF EXISTS (SELECT 1 FROM "public"."CreditPurchase" WHERE "userId" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill CreditPurchase.userId';
    END IF;
END $$;

ALTER TABLE "public"."Transaction" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "public"."CreditPurchase" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CreditPurchase" ADD CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Transaction_userId_date_createdAt_id_idx" ON "public"."Transaction" ("userId", "date" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX "Transaction_userId_origin_date_id_idx" ON "public"."Transaction" ("userId", "originFinancialAccountId", "date" DESC, "id");
CREATE INDEX "Transaction_userId_destination_date_id_idx" ON "public"."Transaction" ("userId", "destinationFinancialAccountId", "date" DESC, "id");
CREATE INDEX "CreditPurchase_userId_purchaseDate_createdAt_id_idx" ON "public"."CreditPurchase" ("userId", "purchaseDate" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX "CreditPurchase_statementId_purchaseDate_id_idx" ON "public"."CreditPurchase" ("statementId", "purchaseDate" DESC, "id");
CREATE INDEX "Transaction_description_search_idx" ON "public"."Transaction" USING GIN (public.normalize_search("description") gin_trgm_ops);
CREATE INDEX "Transaction_storeName_search_idx" ON "public"."Transaction" USING GIN (public.normalize_search("storeName") gin_trgm_ops);
CREATE INDEX "CreditPurchase_description_search_idx" ON "public"."CreditPurchase" USING GIN (public.normalize_search("description") gin_trgm_ops);
CREATE INDEX "CreditPurchase_storeName_search_idx" ON "public"."CreditPurchase" USING GIN (public.normalize_search("storeName") gin_trgm_ops);
