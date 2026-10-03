-- Preserve all credit ledger validations; repair only retired recurrence references.
DO $repair$
DECLARE definition text;
BEGIN
 IF to_regprocedure('public.enforce_credit_purchase_integrity()') IS NULL THEN
  RAISE EXCEPTION 'Credit purchase integrity function missing; restore ledger constraints before repair';
 END IF;
 SELECT pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure) INTO definition;
 definition := replace(replace(replace(definition,
  'subscriptionOccurrenceDate', 'recurrenceOccurrenceDate'),
  'subscriptionId', 'recurrenceId'),
  '"Subscription"', '"Recurrence"');
 EXECUTE definition;
END $repair$;
