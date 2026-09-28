
 INSERT INTO "user" ("id", "email", "name") VALUES ('u', 'credit-backfill@example.test', 'Teste');
		 INSERT INTO "FinancialAccount" ("id", "userId", "name", "type") VALUES ('a', 'u', 'Cartão', 'CREDIT_CARD'), ('rewards', 'u', 'Cashback', 'CHECKING');
		 INSERT INTO "CreditCard" ("id", "financialAccountId", "creditLimit", "statementDay", "dueDay") VALUES ('card', 'a', 5000, 15, 25);
		 INSERT INTO "CreditCardStatement" ("id", "creditCardId", "statementDate", "dueDate", "totalAmount", "paidAmount", "isPaid") VALUES
		 ('aug', 'card', '2024-08-15', '2024-08-25', 9, 9, true), ('sep', 'card', '2024-09-15', '2024-09-25', 10.51, 0, false);
		 INSERT INTO "Category" ("id", "userId", "name") VALUES ('category', 'u', 'Categoria'), ('tag', 'u', 'Tag');
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "storeName", "purchaseDate", "totalAmount", "installmentAmount", "installments", "currentInstallment", "categoryId", "externalId", "cashbackAccountId", "cashbackAmount", "cashbackYieldReferenceRate", "cashbackYieldReferencePercentage", "cashbackYieldPeriod", "feeAmount", "feeDescription")
		 VALUES ('purchase', 'u', 'aug', 'Compra', 'Loja', '2024-08-10', 30.01, 9, 3, 1, 'category', 'purchase-external', 'rewards', 0.3001, 12.5, 100, 'YEARLY', 0.25, 'IOF da compra');
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "purchaseDate", "totalAmount", "installmentAmount", "installments", "currentInstallment", "parentId", "hasImportedAmount", "externalId")
		 VALUES ('child', 'u', 'sep', 'Snapshot antigo', '2024-08-10', 30.01, 10.51, 3, 2, 'purchase', true, 'child-external');
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "purchaseDate", "totalAmount", "installmentAmount", "isRefund", "refundOfPurchaseId") VALUES
		 ('refund', 'u', 'sep', 'Reembolso', '2024-09-10', -5, -5, true, 'child'), ('unlinked', 'u', 'sep', 'Crédito importado', '2024-09-10', -2, -2, true, NULL);
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "purchaseDate", "totalAmount", "installmentAmount", "isStatementCharge", "isSettled")
		 VALUES ('charge', 'u', 'sep', 'Juros', '2024-09-10', 1.25, 1.25, true, true);
		 INSERT INTO "TagAssignment" ("id", "categoryId", "entityType", "entityId") VALUES
		 ('root-tag', 'tag', 'CREDIT_PURCHASE', 'purchase'), ('child-tag', 'tag', 'CREDIT_PURCHASE', 'child');
		 INSERT INTO "CreditPurchaseHistory" ("id", "creditPurchaseId", "field", "oldValue", "newValue") VALUES
		 ('history', 'child', 'installmentAmount', '10', '10.51');
		 INSERT INTO "DebtPerson" ("id", "userId", "name", "normalizedName") VALUES ('person', 'u', 'Pessoa', 'pessoa');
		 INSERT INTO "DebtEvent" ("id", "debtPersonId", "createdByUserId", "amount", "effect", "date") VALUES ('event', 'person', 'u', 4.5, 4.5, '2024-08-10');
		 INSERT INTO "DebtPurchaseLink" ("id", "eventId", "creditPurchaseId", "userId") VALUES ('link', 'event', 'child', 'u');
		 INSERT INTO "DebtSplit" ("id", "userId", "mode", "ownerIncluded", "ownerShares", "creditPurchaseId") VALUES ('split', 'u', 'SHARES', true, 1, 'purchase');
		 INSERT INTO "DebtSplitParticipant" ("id", "debtSplitId", "debtPersonId", "shares", "sortOrder") VALUES ('participant', 'split', 'person', 1, 0);
		 INSERT INTO "CreditCardImport" ("id", "userId", "creditCardId", "provider", "fileName", "statementDate", "dueDate") VALUES ('import', 'u', 'card', 'INTER', 'fatura.pdf', '2024-09-15', '2024-09-25');
		 INSERT INTO "CreditCardImportItem" ("id", "creditCardImportId", "externalId", "purchaseDate", "description", "totalAmount", "installmentAmount", "reconciledCreditPurchaseId") VALUES
		 ('import-item', 'import', 'bank-line', '2024-09-10', 'Compra', 30.01, 10.51, 'child');
		