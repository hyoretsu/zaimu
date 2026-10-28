-- Row ownership resolution shared by transfer fingerprints and write barriers.
CREATE OR REPLACE FUNCTION public.zaimu_record_owner(entity text, record jsonb)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE parent_table text; parent_id text; parent_record jsonb;
BEGIN
 IF record IS NULL THEN RETURN NULL; END IF;
 IF record ? 'userId' THEN RETURN record->>'userId'; END IF;
 IF entity='CreditEntryReference' THEN
  IF record->>'purchaseId' IS NOT NULL THEN parent_table:='CreditPurchaseRecord'; parent_id:=record->>'purchaseId';
  ELSIF record->>'installmentId' IS NOT NULL THEN parent_table:='CreditInstallmentRecord'; parent_id:=record->>'installmentId';
  ELSIF record->>'refundId' IS NOT NULL THEN parent_table:='CreditRefundRecord'; parent_id:=record->>'refundId';
  ELSIF record->>'chargeId' IS NOT NULL THEN parent_table:='CreditStatementCharge'; parent_id:=record->>'chargeId';
  ELSE parent_table:='CreditRefundReview'; parent_id:=record->>'id'; END IF;
 ELSIF entity='RecurrenceOccurrence' THEN parent_table:='Recurrence'; parent_id:=record->>'recurrenceId';
 ELSIF entity='OpenFinanceIdentity' THEN parent_table:='OpenFinanceRecord'; parent_id:=record->>'recordId';
 ELSIF entity='UserInstitutionProfileChange' THEN parent_table:='UserFinancialInstitution'; parent_id:=record->>'linkId';
 ELSIF entity='TagAssignment' THEN parent_table:='Category'; parent_id:=record->>'categoryId';
 ELSIF entity='DebtSplitParticipant' THEN parent_table:='DebtSplit'; parent_id:=record->>'debtSplitId';
 ELSIF entity='LoanPayment' THEN parent_table:='Loan'; parent_id:=record->>'loanId';
 ELSIF entity='OpenFinanceBinding' THEN parent_table:='OpenFinanceConnection'; parent_id:=record->>'connectionId';
 ELSIF record ? 'financialAccountId' THEN parent_table:='FinancialAccount'; parent_id:=record->>'financialAccountId';
 ELSIF record ? 'creditCardId' THEN parent_table:='CreditCard'; parent_id:=record->>'creditCardId';
 ELSIF record ? 'purchaseId' THEN parent_table:='CreditPurchaseRecord'; parent_id:=record->>'purchaseId';
 ELSIF record ? 'creditPurchaseId' THEN parent_table:='CreditEntryReference'; parent_id:=record->>'creditPurchaseId';
 ELSIF record ? 'transactionId' THEN parent_table:='Transaction'; parent_id:=record->>'transactionId';
 ELSIF record ? 'transactionImportId' THEN parent_table:='TransactionImport'; parent_id:=record->>'transactionImportId';
 ELSIF record ? 'creditCardImportId' THEN parent_table:='CreditCardImport'; parent_id:=record->>'creditCardImportId';
 ELSIF record ? 'recurrenceId' THEN parent_table:='Recurrence'; parent_id:=record->>'recurrenceId';
 ELSIF record ? 'statementId' THEN parent_table:='CreditCardStatement'; parent_id:=record->>'statementId';
 END IF;
 IF parent_id IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT to_jsonb(row) FROM public.%I row WHERE "id"=$1',parent_table) INTO parent_record USING parent_id;
 RETURN public.zaimu_record_owner(parent_table,parent_record);
END $$;

CREATE OR REPLACE FUNCTION public.zaimu_ownership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record jsonb; old_record jsonb; owner_id text; previous_owner text; caller text; reference_owner text; key text; referenced_table text;
BEGIN
 record:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_record:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 owner_id:=public.zaimu_record_owner(TG_TABLE_NAME,record);
 previous_owner:=public.zaimu_record_owner(TG_TABLE_NAME,old_record);
 IF owner_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended('account-owner:'||owner_id,0)); END IF;
 IF current_setting('zaimu.account_transfer',true)='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 caller:=nullif(current_setting('zaimu.request_user',true),'');
 IF caller IS NOT NULL AND owner_id IS NOT NULL AND owner_id<>caller AND TG_TABLE_NAME NOT IN ('DebtTransactionLink','DebtPurchaseLink','DebtSplitParticipant') AND NOT EXISTS(SELECT 1 FROM public."user" actor WHERE actor."id"=caller AND actor."role"='ADMIN') THEN RAISE EXCEPTION 'Financial ownership changed' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND previous_owner IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Ownership requires account transfer' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='FinancialAccount' AND TG_OP<>'DELETE' AND record->'transferredProfileContext' IS DISTINCT FROM COALESCE(old_record->'transferredProfileContext','null'::jsonb) THEN
  RAISE EXCEPTION 'Transferred financial context is protected' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='TagAssignment' AND TG_OP<>'DELETE' THEN
  referenced_table:=CASE record->>'entityType' WHEN 'TRANSACTION' THEN 'Transaction' WHEN 'CREDIT_PURCHASE' THEN 'CreditPurchaseRecord' WHEN 'RECURRING_PAYMENT' THEN 'Recurrence' END;
  IF referenced_table IS NOT NULL THEN
   EXECUTE format('SELECT public.zaimu_record_owner($1,to_jsonb(row)) FROM public.%I row WHERE "id"=$2',referenced_table) INTO reference_owner USING referenced_table,record->>'entityId';
   IF reference_owner IS NULL AND record->>'entityType'='CREDIT_PURCHASE' THEN SELECT public.zaimu_record_owner('CreditEntryReference',to_jsonb(entry)) INTO reference_owner FROM public."CreditEntryReference" entry WHERE entry."id"=record->>'entityId'; END IF;
   IF reference_owner IS NOT NULL AND owner_id IS NOT NULL AND reference_owner<>owner_id THEN RAISE EXCEPTION 'Cross-owner tag reference' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public."DetachedFinancialRecord" WHERE "entityType"=TG_TABLE_NAME AND "entityId"=record->>'id') THEN
  RAISE EXCEPTION 'Separated financial history is protected' USING ERRCODE='42501';
 END IF;
 IF TG_OP<>'DELETE' THEN
  FOREACH key IN ARRAY ARRAY['originFinancialAccountId','destinationFinancialAccountId','financialAccountId','paymentAccountId','cashbackAccountId','creditCardId','paymentCreditCardId','recurrenceId','categoryId','outgoingFinancialAccountId','incomingFinancialAccountId','firstTransactionId','secondTransactionId','reconciledImportItemId','reconciledCreditPurchaseId','reconciledTransactionId','transactionId','creditPurchaseId','purchaseId','statementId'] LOOP
   IF record->>key IS NULL THEN CONTINUE; END IF;
   referenced_table:=CASE WHEN key IN ('creditCardId','paymentCreditCardId') THEN 'CreditCard' WHEN key='recurrenceId' THEN 'Recurrence' WHEN key='categoryId' THEN 'Category' WHEN key IN ('firstTransactionId','secondTransactionId','reconciledTransactionId','transactionId') THEN 'Transaction' WHEN key='reconciledImportItemId' THEN 'TransactionImportItem' WHEN key IN ('reconciledCreditPurchaseId','creditPurchaseId') THEN 'CreditEntryReference' WHEN key='purchaseId' THEN 'CreditPurchaseRecord' WHEN key='statementId' THEN 'CreditCardStatement' ELSE 'FinancialAccount' END;
   EXECUTE format('SELECT public.zaimu_record_owner($1,to_jsonb(row)) FROM public.%I row WHERE "id"=$2',referenced_table) INTO reference_owner USING referenced_table,record->>key;
   IF reference_owner IS NOT NULL AND owner_id IS NOT NULL AND reference_owner<>owner_id AND TG_TABLE_NAME NOT IN ('DebtTransactionLink','DebtPurchaseLink') THEN RAISE EXCEPTION 'Cross-owner financial reference' USING ERRCODE='42501'; END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DO $$ DECLARE entity text; BEGIN
 FOREACH entity IN ARRAY ARRAY['TransactionTransferSuggestionRejection','TransactionImportTransferSuggestionRejection','FinancialAccount','CreditCard','RewardsAccount','Transaction','TransactionHistory','TransactionExternalReference','BalanceAdjustment','FinancialAccountYield','FinancialAccountYieldRateHistory','DetachedRewardCredit','CreditCardStatement','CreditCardHistory','CreditPurchaseRecord','CreditInstallmentPlan','CreditInstallmentRecord','CreditRefundRecord','CreditStatementCharge','CreditRefundReview','CreditEntryReference','CreditPurchaseHistory','CreditPurchaseImportIdentity','CreditBookTombstone','Recurrence','RecurrenceHistory','RecurrenceOccurrence','TransactionImport','TransactionImportItem','CreditCardImport','CreditCardImportItem','DebtSplit','DebtSplitParticipant','DebtTransactionLink','DebtPurchaseLink','LoanPayment','UserFinancialInstitution','UserInstitutionProfileChange','Category','TagAssignment','OpenFinanceBinding','OpenFinanceRecord','OpenFinanceIdentity'] LOOP
  EXECUTE format('CREATE TRIGGER zaimu_ownership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.zaimu_ownership_guard()',entity);
 END LOOP;
END $$;
ALTER TABLE public."AccountTransfer" ADD CONSTRAINT "AccountTransfer_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','DECLINED','CANCELLED'));
ALTER TABLE public."AccountTransfer" ADD CONSTRAINT "AccountTransfer_distinct_users" CHECK ("senderId"<>"recipientId");
ALTER TABLE public."PushDevice" ADD CONSTRAINT "PushDevice_platform_check" CHECK ("platform" IN ('WEB','ANDROID','IOS'));
ALTER TABLE public."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_status_check" CHECK ("status" IN ('PENDING','SENT','SKIPPED'));
