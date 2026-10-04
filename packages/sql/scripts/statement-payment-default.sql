-- Local migration artifact. Apply through the deployment migration workflow.
BEGIN;
ALTER TABLE "FinancialAccount" ADD COLUMN IF NOT EXISTS "isDefaultForStatements" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialAccount_statement_default_user_key"
ON "FinancialAccount" ("userId") WHERE "isDefaultForStatements";
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_statement_default_type_check"
CHECK (NOT "isDefaultForStatements" OR ("type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT')));
COMMIT;
