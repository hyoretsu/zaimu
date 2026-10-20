-- Lock writers until duplicate cleanup and the unique index are committed together.
LOCK TABLE public."FinancialAccountYield" IN ACCESS EXCLUSIVE MODE;

-- A reported value wins over a calculation. Preserve the newest authoritative row.
CREATE TEMP TABLE yield_duplicate_ids ON COMMIT DROP AS
SELECT "id" AS removed_id, kept_id
FROM (
  SELECT "id",
    first_value("id") OVER ranked AS kept_id,
    row_number() OVER ranked AS priority
  FROM public."FinancialAccountYield"
  WINDOW ranked AS (
    PARTITION BY "financialAccountId", "date"
    ORDER BY ("externalId" IS NOT NULL) DESC,
      ("kind" = 'MANUAL') DESC, ("origin" = 'USER') DESC,
      "updatedAt" DESC, "createdAt" DESC, "id" DESC
  )
) ranked_yields
WHERE priority > 1;

-- Imported synchronization links must continue pointing at the surviving yield.
UPDATE public."OpenFinanceRecord" AS record
SET "localId" = duplicate.kept_id
FROM yield_duplicate_ids AS duplicate
WHERE record."localKind" = 'YIELD' AND record."localId" = duplicate.removed_id;

DELETE FROM public."FinancialAccountYield" AS yield
USING yield_duplicate_ids AS duplicate
WHERE yield."id" = duplicate.removed_id;
