INSERT INTO "FinancialAccount" ("id","userId","name","type","balance") VALUES
 ('balance-test-cash',$1,'Balance cash','CASH',0),
 ('balance-test-saving',$1,'Balance saving','SAVINGS',0),
 ('balance-test-rewards',$1,'Balance cashback','REWARDS',0),
 ('balance-test-points',$1,'Balance points','REWARDS',0);
INSERT INTO "RewardsAccount" ("financialAccountId","kind","initialBalance") VALUES
 ('balance-test-rewards','CASHBACK',125.4321),('balance-test-points','POINTS',999);
INSERT INTO "Transaction" ("id","userId","description","date","amount","type","originFinancialAccountId","destinationFinancialAccountId") VALUES
 ('balance-test-income',$1,'Balance income','2023-08-01',10.01,'INCOME',NULL,'balance-test-cash'),
 ('balance-test-transfer',$1,'Balance transfer','2025-10-04',3.22,'TRANSFER','balance-test-cash','balance-test-saving'),
 ('balance-test-self',$1,'Balance self transfer','2026-10-04',99.99,'TRANSFER','balance-test-cash','balance-test-cash');
INSERT INTO "BalanceAdjustment" ("userId","financialAccountId","date","balance") VALUES
 ($1,'balance-test-cash','2024-01-03',100.23),($1,'balance-test-cash','2026-09-22',500.99);
INSERT INTO "FinancialAccountYield" ("financialAccountId","date","amount","kind","isExcluded") VALUES
 ('balance-test-cash','2024-01-03',99.1234,'AUTOMATIC',false),
 ('balance-test-cash','2026-10-04',0.1234,'AUTOMATIC',false),
 ('balance-test-cash','2026-09-23',123.9999,'AUTOMATIC',true),
 ('balance-test-saving','2026-10-04',NULL,'AUTOMATIC',false),
 ('balance-test-saving','2026-09-22',0.3333,'AUTOMATIC',false);
UPDATE "CreditPurchaseRecord" SET "cashbackAccountId"='balance-test-rewards',"cashbackAmount"=0.5678,"purchaseDate"='2026-10-04' WHERE "id"=(SELECT "id" FROM "CreditPurchaseRecord" WHERE "userId"=$1 ORDER BY "id" LIMIT 1);
