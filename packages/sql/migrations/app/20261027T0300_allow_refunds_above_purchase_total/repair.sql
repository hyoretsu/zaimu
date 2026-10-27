-- Remove only the retired refund ceiling; retain installed integrity checks.
DO $repair$
DECLARE definition text;
BEGIN
 IF to_regprocedure('public.enforce_credit_purchase_integrity()') IS NULL THEN
  RAISE EXCEPTION 'Credit purchase integrity function missing';
 END IF;
 SELECT pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure) INTO definition;
 definition := replace(definition, $ceiling$ IF (SELECT COALESCE(sum("amount"), 0) FROM "CreditRefundRecord" WHERE "purchaseId" = target AND "deletedAt" IS NULL) > total THEN RAISE EXCEPTION 'Refunds exceed purchase total'; END IF;$ceiling$, '');
 IF position('Refunds exceed purchase total' in definition) > 0 THEN
  RAISE EXCEPTION 'Unrecognized refund ceiling; review integrity function before migration';
 END IF;
 EXECUTE definition;
END $repair$;
