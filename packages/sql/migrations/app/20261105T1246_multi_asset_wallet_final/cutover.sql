-- One transactional cutover: backfill every denomination before removing scalar fields.

CREATE TABLE public."Asset" ("code" character varying(12) NOT NULL,
"createdAt" timestamp(3) NOT NULL DEFAULT now(),
"decimals" int2 NOT NULL,
"kind" character varying(6) NOT NULL,
"name" character varying(100) NOT NULL,
"quoteProvider" character varying(40),
"updatedAt" timestamp(3) NOT NULL DEFAULT now(),
PRIMARY KEY ("code"));

CREATE TABLE public."FinancialAccountAsset" ("assetCode" character varying(12) NOT NULL,
"balance" numeric(38,18) NOT NULL DEFAULT 0,
"createdAt" timestamp(3) NOT NULL DEFAULT now(),
"financialAccountId" character varying(36) NOT NULL,
"updatedAt" timestamp(3) NOT NULL DEFAULT now(),
PRIMARY KEY ("financialAccountId","assetCode"));

CREATE INDEX "FinancialAccountAsset_assetCode_idx_5ca58f33" ON public."FinancialAccountAsset" ("assetCode");

ALTER TABLE public."FinancialAccountAsset" ADD CONSTRAINT "FinancialAccountAsset_account_fkey" FOREIGN KEY ("financialAccountId") REFERENCES public."FinancialAccount" ("id") ON DELETE CASCADE;

ALTER TABLE public."FinancialAccountAsset" ADD CONSTRAINT "FinancialAccountAsset_asset_fkey" FOREIGN KEY ("assetCode") REFERENCES public."Asset" ("code");

INSERT INTO public."Asset" ("code","kind","name","decimals")
SELECT code,'FIAT',code,CASE
 WHEN code IN ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF') THEN 0
 WHEN code IN ('BHD','IQD','JOD','KWD','LYD','OMR','TND') THEN 3
 WHEN code IN ('CLF','UYW') THEN 4 ELSE 2 END
FROM (
 SELECT "currency" AS code FROM public."FinancialAccount"
 UNION SELECT "bookingCurrency" FROM public."Transaction"
 UNION SELECT "destinationCurrency" FROM public."Transaction"
 UNION SELECT COALESCE(p."accountCurrency",a."currency") FROM public."LoanPayment" p LEFT JOIN public."FinancialAccount" a ON a."id"=p."financialAccountId"
 UNION SELECT "currency" FROM public."BalanceAdjustment"
 UNION SELECT "currency" FROM public."FinancialAccountYield"
 UNION SELECT "currency" FROM public."CreditCard"
) codes WHERE code IS NOT NULL;
INSERT INTO public."FinancialAccountAsset" ("financialAccountId","assetCode","balance","createdAt","updatedAt")
SELECT "id","currency",COALESCE("balance",0),"createdAt","updatedAt" FROM public."FinancialAccount";
-- Historical side fields retain their meaning: amount/bookingCurrency, originalAmount/currency and paymentAmount/paymentCurrency.
UPDATE public."Transaction" t SET "destinationCurrency"=a."currency"
FROM public."FinancialAccount" a WHERE a."id"=t."destinationFinancialAccountId" AND t."destinationCurrency" IS NULL;
UPDATE public."LoanPayment" p SET "accountCurrency"=COALESCE(p."accountCurrency",a."currency"),"accountAmount"=COALESCE(p."accountAmount",p."totalPaid")
FROM public."FinancialAccount" a WHERE a."id"=p."financialAccountId";
INSERT INTO public."FinancialAccountAsset" ("financialAccountId","assetCode")
SELECT "originFinancialAccountId","bookingCurrency" FROM public."Transaction" WHERE "originFinancialAccountId" IS NOT NULL
UNION SELECT "destinationFinancialAccountId","destinationCurrency" FROM public."Transaction" WHERE "destinationFinancialAccountId" IS NOT NULL
UNION SELECT "financialAccountId","accountCurrency" FROM public."LoanPayment" WHERE "financialAccountId" IS NOT NULL
UNION SELECT "financialAccountId","currency" FROM public."BalanceAdjustment"
UNION SELECT "financialAccountId","currency" FROM public."FinancialAccountYield"
ON CONFLICT ("financialAccountId","assetCode") DO NOTHING;

ALTER TABLE public."BalanceAdjustment" ADD COLUMN "assetCode" character varying(12);

UPDATE public."BalanceAdjustment" SET "assetCode"="currency";

ALTER TABLE public."BalanceAdjustment" ALTER COLUMN "assetCode" SET NOT NULL;

ALTER TABLE public."FinancialAccountYield" ADD COLUMN "assetCode" character varying(12);

UPDATE public."FinancialAccountYield" SET "assetCode"="currency";

ALTER TABLE public."FinancialAccountYield" ALTER COLUMN "assetCode" SET NOT NULL;

ALTER TABLE public."RewardsAccount" ADD COLUMN "assetCode" character varying(12);

UPDATE public."RewardsAccount" t SET "assetCode"=a."currency" FROM public."FinancialAccount" a WHERE a."id"=t."financialAccountId";

ALTER TABLE public."RewardsAccount" ALTER COLUMN "assetCode" SET NOT NULL;

ALTER TABLE public."DetachedRewardCredit" ADD COLUMN "assetCode" character varying(12);

UPDATE public."DetachedRewardCredit" t SET "assetCode"=a."currency" FROM public."FinancialAccount" a WHERE a."id"=t."financialAccountId";

ALTER TABLE public."DetachedRewardCredit" ALTER COLUMN "assetCode" SET NOT NULL;

ALTER TABLE public."FinancialAccountYieldRateHistory" ADD COLUMN "currency" character varying(3);

UPDATE public."FinancialAccountYieldRateHistory" t SET "currency"=a."currency" FROM public."FinancialAccount" a WHERE a."id"=t."financialAccountId";

ALTER TABLE public."FinancialAccountYieldRateHistory" ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE public."CreditPurchaseRecord" ADD COLUMN "cashbackCurrency" character varying(12);

UPDATE public."CreditPurchaseRecord" t SET "cashbackCurrency"=a."currency" FROM public."FinancialAccount" a WHERE a."id"=t."cashbackAccountId";

ALTER TABLE public."FinancialAccount" RENAME COLUMN "currency" TO "yieldCurrency";
ALTER TABLE public."FinancialAccount" DROP COLUMN "balance";
ALTER TABLE public."FinancialAccount" ALTER COLUMN "yieldCurrency" DROP NOT NULL;
ALTER TABLE public."FinancialAccount" ALTER COLUMN "yieldCurrency" DROP DEFAULT;
ALTER TABLE public."BalanceAdjustment" DROP COLUMN "currency";
ALTER TABLE public."FinancialAccountYield" DROP COLUMN "currency";

DROP INDEX public."BalanceAdjustment_userId_account_date_key";

CREATE UNIQUE INDEX "BalanceAdjustment_userId_account_date_key" ON public."BalanceAdjustment" ("userId","financialAccountId","assetCode","date");

DROP INDEX public."FinancialAccountYield_accountId_date_key";

CREATE UNIQUE INDEX "FinancialAccountYield_accountId_date_key" ON public."FinancialAccountYield" ("financialAccountId","assetCode","date");

DO $money_precision$
DECLARE
 saved_views jsonb;
 saved_view jsonb;
BEGIN
 -- Preserve live definitions, including renamed and removed legacy columns.
 SELECT jsonb_agg(jsonb_build_object(
  'name', c.relname, 'definition', pg_get_viewdef(c.oid, true),
  'owner', pg_get_userbyid(c.relowner), 'options', array_to_string(c.reloptions, ', '),
  'grants', (SELECT string_agg(format('GRANT %s ON public.%I TO %s%s;',
   a.privilege_type, c.relname,
   CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
   CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END), ' ')
   FROM aclexplode(c.relacl) a)
 ) ORDER BY CASE c.relname WHEN 'CreditRefundEffect' THEN 1 ELSE 2 END)
 INTO saved_views FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v'
 AND c.relname IN ('CreditRefundEffect', 'CreditEntry', 'CreditConsumption');
 -- Unknown dependents abort safely: never use CASCADE.
 DROP VIEW IF EXISTS public."CreditEntry", public."CreditConsumption";
 DROP VIEW IF EXISTS public."CreditRefundEffect";

 ALTER TABLE public."CreditPurchaseRecord" ALTER COLUMN "cashbackAmount" TYPE numeric(38,18);
 ALTER TABLE public."DetachedRewardCredit" ALTER COLUMN "amount" TYPE numeric(38,18) USING "amount"::numeric(38,18);
 ALTER TABLE public."Transaction" ALTER COLUMN "amount" TYPE numeric(38,18) USING "amount"::numeric(38,18);
 ALTER TABLE public."Transaction" ALTER COLUMN "originalAmount" TYPE numeric(38,18) USING "originalAmount"::numeric(38,18);
 ALTER TABLE public."Transaction" ALTER COLUMN "destinationAmount" TYPE numeric(38,18) USING "destinationAmount"::numeric(38,18);
 ALTER TABLE public."Transaction" ALTER COLUMN "paymentAmount" TYPE numeric(38,18) USING "paymentAmount"::numeric(38,18);
 ALTER TABLE public."Transaction" ALTER COLUMN "exchangeRate" TYPE numeric(38,18) USING "exchangeRate"::numeric(38,18);
 ALTER TABLE public."BalanceAdjustment" ALTER COLUMN "balance" TYPE numeric(38,18) USING "balance"::numeric(38,18);
 ALTER TABLE public."FinancialAccountYield" ALTER COLUMN "amount" TYPE numeric(38,18) USING "amount"::numeric(38,18);
 ALTER TABLE public."Transaction" ALTER COLUMN "currency" TYPE varchar(12);
 ALTER TABLE public."Transaction" ALTER COLUMN "bookingCurrency" TYPE varchar(12);
 ALTER TABLE public."Transaction" ALTER COLUMN "destinationCurrency" TYPE varchar(12);
 ALTER TABLE public."Transaction" ALTER COLUMN "paymentCurrency" TYPE varchar(12);
 FOR saved_view IN SELECT value FROM jsonb_array_elements(saved_views) LOOP
  EXECUTE format('CREATE VIEW public.%I %s AS %s', saved_view->>'name',
   CASE WHEN saved_view->>'options' IS NULL THEN '' ELSE 'WITH (' || (saved_view->>'options') || ')' END,
   saved_view->>'definition');
  EXECUTE format('ALTER VIEW public.%I OWNER TO %I', saved_view->>'name', saved_view->>'owner');
  IF saved_view->>'grants' IS NOT NULL THEN EXECUTE saved_view->>'grants'; END IF;
 END LOOP;
END $money_precision$;

ALTER TABLE public."Asset" ADD CONSTRAINT "Asset_code_format" CHECK ("code" ~ '^[A-Z0-9]{2,12}$');
ALTER TABLE public."Asset" ADD CONSTRAINT "Asset_kind_values" CHECK ("kind" IN ('FIAT','CRYPTO'));
ALTER TABLE public."Asset" ADD CONSTRAINT "Asset_decimal_range" CHECK ("decimals" BETWEEN 0 AND 18);

DO $holding_backfill$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public."FinancialAccount" account
  WHERE NOT EXISTS (
   SELECT 1 FROM public."FinancialAccountAsset" holding
   WHERE holding."financialAccountId"=account."id"
  )
 ) THEN
  RAISE EXCEPTION 'Multi-asset cutover left an account without a holding';
 END IF;
END $holding_backfill$;

ALTER TABLE public."RewardsAccount" ALTER COLUMN "initialBalance" TYPE numeric(38,18);
CREATE TABLE public."AssetQuoteSnapshot" (
 "id" varchar(36) PRIMARY KEY DEFAULT cuid2(), "assetCode" varchar(12) NOT NULL,
 "quoteCurrency" varchar(12) NOT NULL, "date" date NOT NULL,
 "price" numeric(38,18) NOT NULL, "sourceTime" timestamp(3) NOT NULL,
 "provider" varchar(80) NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now(),
 FOREIGN KEY ("assetCode") REFERENCES public."Asset"("code") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "AssetQuoteSnapshot_identity_key" ON public."AssetQuoteSnapshot"("assetCode","quoteCurrency","date","provider");
CREATE INDEX "AssetQuoteSnapshot_date_quoteCurrency_idx_bae8a499" ON public."AssetQuoteSnapshot"("date","quoteCurrency");
