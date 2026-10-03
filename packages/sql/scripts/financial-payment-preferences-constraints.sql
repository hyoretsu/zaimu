-- Apply after the additive financial_payment_preferences migration.
-- No initial primary account is selected.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialAccount_primary_user_key"
ON "FinancialAccount" ("userId") WHERE "isPrimary";
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialAccount_primary_type_check' AND conrelid = '"FinancialAccount"'::regclass) THEN
        ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_primary_type_check"
        CHECK (NOT "isPrimary" OR "type" IN ('CHECKING', 'CASH'));
    END IF;
END $$;
COMMIT;
