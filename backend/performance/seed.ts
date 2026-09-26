const performanceDatabaseUrl = process.env.PERFORMANCE_DATABASE_URL;

if (!performanceDatabaseUrl) throw new Error("Defina PERFORMANCE_DATABASE_URL");

const databaseUrl = new URL(performanceDatabaseUrl);
const databaseName = databaseUrl.pathname.slice(1);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname))
	throw new Error("A fixture aceita somente PostgreSQL local");
if (!/(performance|benchmark|test)/i.test(databaseName))
	throw new Error("O nome do banco deve conter performance, benchmark ou test");

process.env.DATABASE_URL = performanceDatabaseUrl;

const migration = Bun.spawnSync(["bun", "run", "migrate:deploy"], {
	cwd: new URL("../../packages/sql", import.meta.url).pathname,
	env: process.env,
	stderr: "inherit",
	stdout: "inherit",
});
if (migration.exitCode !== 0) process.exit(migration.exitCode);

const { closeDatabase, withRawTransaction } = await import("sql");
const userId = "performance-user";
const peerUserId = "performance-peer";
const anchorDate = "2026-09-22";

try {
	await withRawTransaction(async query => {
		await query('DELETE FROM "user" WHERE "id" = $1', [peerUserId]);
		await query('DELETE FROM "user" WHERE "id" = $1', [userId]);
		await query(
			`INSERT INTO "user" ("id", "email", "name", "emailVerified")
			 VALUES ($1, 'performance@zaimu.local', 'Performance Fixture', true)`,
			[userId],
		);
		await query(
			`INSERT INTO "user" ("id", "email", "name", "emailVerified")
			 VALUES ($1, 'performance-peer@zaimu.local', 'Performance Peer', true)`,
			[peerUserId],
		);
		await query(
			`INSERT INTO "FinancialInstitution" ("id", "userId", "name", "normalizedName")
			 SELECT 'perf-institution-' || series,
			        $1,
			        'Instituição ' || series,
			        'instituicao ' || series
			 FROM generate_series(1, 5) AS series`,
			[userId],
		);
		await query(
			`INSERT INTO "Category" ("id", "userId", "name", "color")
			 SELECT 'perf-category-' || series,
			        $1,
			        'Categoria ' || series,
			        CASE series % 4
			          WHEN 0 THEN '#2563eb'
			          WHEN 1 THEN '#16a34a'
			          WHEN 2 THEN '#dc2626'
			          ELSE '#9333ea'
			        END
			 FROM generate_series(1, 12) AS series`,
			[userId],
		);
		await query(
			`INSERT INTO "Store" ("id", "userId", "name", "normalizedName")
			 SELECT 'perf-store-' || lpad(series::text, 4, '0'),
			        $1,
			        'Loja ' || lpad(series::text, 4, '0'),
			        'loja ' || lpad(series::text, 4, '0')
			 FROM generate_series(1, 500) AS series`,
			[userId],
		);
		await query(
			`INSERT INTO "FinancialAccount"
			 ("id", "userId", "name", "type", "balance", "institutionId")
			 VALUES ('perf-account-main', $1, 'Conta principal', 'CHECKING', 25000, 'perf-institution-1')`,
			[userId],
		);
		await query(
			`INSERT INTO "FinancialAccount"
			 ("id", "userId", "name", "type", "balance", "institutionId")
			 SELECT 'perf-account-card-' || lpad(series::text, 2, '0'),
			        $1,
			        'Cartão ' || lpad(series::text, 2, '0'),
			        'CREDIT_CARD',
			        0,
			        'perf-institution-' || (((series - 1) % 5) + 1)
			 FROM generate_series(1, 20) AS series`,
			[userId],
		);
		await query(
			`INSERT INTO "CreditCard"
			 ("id", "financialAccountId", "creditLimit", "statementDay", "dueDay", "workingDueDate")
			 SELECT 'perf-card-' || lpad(series::text, 2, '0'),
			        'perf-account-card-' || lpad(series::text, 2, '0'),
			        5000 + series * 250,
			        10,
			        17,
			        false
			 FROM generate_series(1, 20) AS series`,
		);
		await query(
			`INSERT INTO "FinancialAccountYieldRateHistory"
			 ("id", "financialAccountId", "effectiveDate", "yieldPeriod", "yieldReferenceType",
			  "yieldReferencePercentage", "yieldFixedRate", "yieldTaxRate")
			 SELECT 'perf-rate-' || lpad(series::text, 4, '0'),
			        'perf-account-main',
			        (date_trunc('month', $1::date) - make_interval(months => series))::date,
			        'MONTHLY', 'CDI', 100, 0, 22.5
			 FROM generate_series(0, 59) AS series`,
			[anchorDate],
		);
		await query(
			`INSERT INTO "FinancialAccountYield"
			 ("id", "financialAccountId", "date", "amount", "kind", "origin")
			 SELECT 'perf-yield-' || lpad(series::text, 5, '0'),
			        'perf-account-main',
			        $1::date - series,
			        ((series % 500) + 1)::numeric / 100,
			        'AUTOMATIC', 'SYSTEM'
			 FROM generate_series(0, 1825) AS series`,
			[anchorDate],
		);
		await query(
			`INSERT INTO "CreditCardStatement"
			 ("id", "creditCardId", "statementDate", "dueDate", "isPaid", "isFullySynced")
			 SELECT 'perf-statement-' || lpad(card::text, 2, '0') || '-' || lpad(month::text, 2, '0'),
			        'perf-card-' || lpad(card::text, 2, '0'),
			        (date_trunc('month', $1::date) - make_interval(months => month) + interval '9 days')::date,
			        (date_trunc('month', $1::date) - make_interval(months => month) + interval '16 days')::date,
			        month > 0,
			        true
			 FROM generate_series(1, 20) AS card
			 CROSS JOIN generate_series(0, 59) AS month`,
			[anchorDate],
		);
		await query(
			`INSERT INTO "Transaction"
			 ("id", "userId", "amount", "date", "time", "description", "storeName", "type",
			  "categoryId", "originFinancialAccountId", "destinationFinancialAccountId", "createdAt", "updatedAt")
			 SELECT 'perf-tx-' || lpad(series::text, 10, '0'),
			        $1,
			        ((series % 50000) + 100)::numeric / 100,
			        $2::date - (series % 1826)::integer,
			        make_time((series % 24)::integer, (series % 60)::integer, 0),
			        CASE series % 5
			          WHEN 0 THEN 'Supermercado São José'
			          WHEN 1 THEN 'Transferência recebida'
			          WHEN 2 THEN 'Restaurante Açúcar'
			          WHEN 3 THEN 'Farmácia Central'
			          ELSE 'Pagamento mensal'
			        END || ' ' || series,
			        CASE WHEN series % 2 = 0 THEN 'Loja ' || (series % 200) ELSE NULL END,
			        CASE WHEN series % 5 = 1 THEN 'INCOME' ELSE 'EXPENSE' END,
			        'perf-category-' || ((series % 12) + 1),
			        CASE WHEN series % 5 = 1 THEN NULL ELSE 'perf-account-main' END,
			        CASE WHEN series % 5 = 1 THEN 'perf-account-main' ELSE NULL END,
			        ($2::date - (series % 1826)::integer)::timestamp + make_interval(secs => series % 86400),
			        ($2::date - (series % 1826)::integer)::timestamp + make_interval(secs => series % 86400)
			 FROM generate_series(1, 100000) AS series`,
			[userId, anchorDate],
		);
		await query(
			`INSERT INTO "CreditPurchase"
			 ("id", "userId", "statementId", "description", "storeName", "totalAmount", "installmentAmount",
			  "purchaseDate", "categoryId", "createdAt", "updatedAt")
			 SELECT 'perf-purchase-' || lpad(card::text, 2, '0') || '-' || lpad(month::text, 2, '0') || '-' || item,
			        $1,
			        'perf-statement-' || lpad(card::text, 2, '0') || '-' || lpad(month::text, 2, '0'),
			        'Compra associada ' || item,
			        'Loja ' || ((card * 10 + item) % 200),
			        (card * item + 100)::numeric / 10,
			        (card * item + 100)::numeric / 10,
			        (date_trunc('month', $2::date) - make_interval(months => month) - make_interval(days => item))::date,
			        'perf-category-' || (((card + item) % 12) + 1),
			        (date_trunc('month', $2::date) - make_interval(months => month) - make_interval(days => item))::timestamp,
			        (date_trunc('month', $2::date) - make_interval(months => month) - make_interval(days => item))::timestamp
			 FROM generate_series(1, 20) AS card
			 CROSS JOIN generate_series(0, 59) AS month
			 CROSS JOIN generate_series(1, 10) AS item`,
			[userId, anchorDate],
		);
		await query(
			`UPDATE "CreditCardStatement" statement
			 SET "totalAmount" = totals.amount,
			     "paidAmount" = CASE WHEN statement."isPaid" THEN totals.amount ELSE 0 END
			 FROM (
			   SELECT "statementId", sum("totalAmount") AS amount
			   FROM "CreditPurchase"
			   WHERE "userId" = $1
			   GROUP BY "statementId"
			 ) totals
			 WHERE statement."id" = totals."statementId"`,
			[userId],
		);
		await query(
			`INSERT INTO "TagAssignment" ("id", "categoryId", "entityType", "entityId")
			 SELECT 'perf-tag-' || lpad(series::text, 10, '0'),
			        'perf-category-' || ((series % 12) + 1),
			        'TRANSACTION',
			        'perf-tx-' || lpad(series::text, 10, '0')
			 FROM generate_series(10, 100000, 10) AS series`,
		);
		await query(
			`INSERT INTO "DebtConnection" ("id", "requesterId", "recipientId", "status", "respondedAt")
			 VALUES ('perf-debt-connection', $1, $2, 'ACCEPTED', now())`,
			[userId, peerUserId],
		);
		await query(
			`INSERT INTO "DebtPerson" ("id", "userId", "name", "normalizedName", "connectionId") VALUES
			 ('perf-debt-person-owner', $1, 'Performance Peer', 'performance peer', 'perf-debt-connection'),
			 ('perf-debt-person-peer', $2, 'Performance Fixture', 'performance fixture', 'perf-debt-connection')`,
			[userId, peerUserId],
		);
		await query(
			`INSERT INTO "DebtEvent"
			 ("id", "debtPersonId", "connectionId", "createdByUserId", "kind", "amount", "effect", "date", "description")
			 SELECT 'perf-debt-event-' || lpad(series::text, 5, '0'),
			        CASE WHEN series % 2 = 0 THEN 'perf-debt-person-owner' ELSE 'perf-debt-person-peer' END,
			        'perf-debt-connection',
			        CASE WHEN series % 2 = 0 THEN $1 ELSE $2 END,
			        'ORIGIN', ((series % 30000) + 100)::numeric / 100,
			        CASE WHEN series % 3 = 0 THEN -1 ELSE 1 END * ((series % 30000) + 100)::numeric / 100,
			        $3::date - (series % 1826)::integer,
			        'Lançamento de desempenho ' || series
			 FROM generate_series(1, 5000) AS series`,
			[userId, peerUserId, anchorDate],
		);
		await query(
			`INSERT INTO "Loan"
			 ("id", "userId", "lender", "principalAmount", "interestRate", "totalInstallments",
			  "installmentAmount", "dueDay", "startDate", "firstDueDate", "amortization")
			 SELECT 'perf-loan-' || lpad(series::text, 3, '0'), $1, 'Banco ' || series,
			        10000 + series * 100, 0.015, 60, 250 + series, 10,
			        ($2::date - make_interval(months => 24))::date,
			        ($2::date - make_interval(months => 23))::date,
			        CASE WHEN series % 2 = 0 THEN 'PRICE'::"AmortizationType" ELSE 'SAC'::"AmortizationType" END
			 FROM generate_series(1, 25) AS series`,
			[userId, anchorDate],
		);
		await query(
			`INSERT INTO "LoanPayment"
			 ("id", "loanId", "installmentNumber", "principalPaid", "interestPaid", "totalPaid", "dueDate", "paidDate")
			 SELECT 'perf-loan-payment-' || lpad(loan::text, 3, '0') || '-' || lpad(installment::text, 2, '0'),
			        'perf-loan-' || lpad(loan::text, 3, '0'), installment, 200, 50, 250,
			        ($1::date - make_interval(months => 24 - installment))::date,
			        CASE WHEN installment <= 24 THEN ($1::date - make_interval(months => 24 - installment))::date ELSE NULL END
			 FROM generate_series(1, 25) AS loan CROSS JOIN generate_series(1, 60) AS installment`,
			[anchorDate],
		);
		await query(
			`INSERT INTO "LoanHistory" ("id", "loanId", "field", "oldValue", "newValue", "changedAt")
			 SELECT 'perf-loan-history-' || lpad(loan::text, 3, '0') || '-' || lpad(item::text, 2, '0'),
			        'perf-loan-' || lpad(loan::text, 3, '0'), 'interestRate', '0.014', '0.015',
			        $1::timestamp - make_interval(days => item)
			 FROM generate_series(1, 25) AS loan CROSS JOIN generate_series(1, 20) AS item`,
			[anchorDate],
		);
		await query(
			`INSERT INTO "Salary"
			 ("id", "userId", "financialAccountId", "source", "amount", "frequency", "payDay", "startDate", "isActive")
			 SELECT 'perf-salary-' || lpad(series::text, 3, '0'), $1, 'perf-account-main',
			        'Salário ' || series, 3000 + series * 10, 'MONTHLY', 5, ($2::date - interval '2 years')::date, true
			 FROM generate_series(1, 40) AS series`,
			[userId, anchorDate],
		);
		await query(
			`INSERT INTO "Subscription"
			 ("id", "userId", "name", "amount", "billingDay", "frequency", "paymentMethod",
			  "financialAccountId", "startDate", "isActive")
			 SELECT 'perf-subscription-' || lpad(series::text, 3, '0'), $1, 'Assinatura ' || series,
			        20 + series, 15, 'MONTHLY', 'DEBIT', 'perf-account-main', ($2::date - interval '2 years')::date, true
			 FROM generate_series(1, 100) AS series`,
			[userId, anchorDate],
		);
		await query(
			`INSERT INTO "RecurringPayment"
			 ("id", "userId", "name", "amount", "frequency", "dayOfMonth", "startDate",
			  "financialAccountId", "paymentMethod", "isActive")
			 SELECT 'perf-recurring-' || lpad(series::text, 3, '0'), $1, 'Recorrência ' || series,
			        50 + series, 'MONTHLY', 20, ($2::date - interval '2 years')::date,
			        'perf-account-main', 'DEBIT', true
			 FROM generate_series(1, 100) AS series`,
			[userId, anchorDate],
		);
		await query(
			`ANALYZE "Transaction", "CreditPurchase", "CreditCardStatement", "TagAssignment",
			 "FinancialAccountYield", "DebtEvent", "Loan", "LoanPayment", "LoanHistory",
			 "Salary", "Subscription", "RecurringPayment", "Store"`,
		);
	});
	console.log(
		JSON.stringify({
			creditCards: 20,
			creditPurchases: 12000,
			debtEvents: 5000,
			loans: 25,
			recurringPayments: 100,
			salaries: 40,
			statements: 1200,
			stores: 500,
			subscriptions: 100,
			transactions: 100000,
			userId,
			yields: 1826,
		}),
	);
} finally {
	await closeDatabase();
}
