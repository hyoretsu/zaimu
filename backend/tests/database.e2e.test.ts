import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const suite = databaseTestUrl ? describe : describe.skip;

interface Server {
	handle(request: Request): Response | Promise<Response>;
}

let server: Server;
let db: typeof import("sql")["db"];
let closeDatabase: () => Promise<void>;
let executeStatement: typeof import("sql")["executeStatement"];
let queryRows: typeof import("sql")["queryRows"];
const userIds: string[] = [];

const jsonRequest = (path: string, method: string, body?: unknown, cookie?: string) =>
	server.handle(
		new Request(`http://localhost${path}`, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: {
				...(cookie ? { cookie } : {}),
				"content-type": "application/json",
				origin: "http://localhost:5173",
				"x-forwarded-for": `127.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
			},
			method,
		}),
	);

interface TestLedger {
	people: Array<{
		id: string;
		balance: number;
		events: Array<Record<string, unknown> & { amount: number; effect: number; id: string }>;
	}>;
}
async function loadLedger(response: Response, cookie: string): Promise<TestLedger> {
	if (response.status !== 200) throw new Error(`Ledger failed: ${response.status}`);
	const ledger = (await response.json()) as TestLedger;
	for (const person of ledger.people) {
		if ("events" in person) throw new Error("Debt summary must not embed events");
		person.events = [];
		let cursor: string | null = null;
		do {
			const pageResponse = await jsonRequest(
				`/debts/people/${person.id}/events?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
				"GET",
				undefined,
				cookie,
			);
			if (pageResponse.status !== 200) throw new Error(`Debt page failed: ${pageResponse.status}`);
			const page = (await pageResponse.json()) as { items: typeof person.events; nextCursor: string | null };
			person.events.push(...page.items);
			cursor = page.nextCursor;
		} while (cursor);
	}
	return ledger;
}

const createSession = async (label: string) => {
	const email = `prisma8-${label}-${crypto.randomUUID()}@example.com`;
	const password = "Prisma8-test-password";
	const signup = await jsonRequest("/api/auth/sign-up/email", "POST", {
		email,
		name: `Prisma 8 ${label}`,
		password,
	});
	if (signup.status !== 200) throw new Error(`Signup failed with ${signup.status}: ${await signup.text()}`);

	const user = await db.orm.public.User.where(fields => fields.email.eq(email as never)).update({
		emailVerified: true,
	});
	const userId = user?.id;
	if (!userId) throw new Error("Signup user was not persisted");
	userIds.push(userId!);

	const signin = await jsonRequest("/api/auth/sign-in/email", "POST", { email, password });
	if (signin.status !== 200) throw new Error(`Signin failed with ${signin.status}`);
	const cookie = signin.headers.get("set-cookie")?.split(";")[0];
	if (!cookie) throw new Error("Signin did not return a session cookie");
	return { cookie: cookie!, email, userId: userId! };
};

suite("Prisma 8 SQL query builder", () => {
	beforeAll(async () => {
		process.env.DATABASE_URL = databaseTestUrl!;
		process.env.NODE_ENV = "test";
		process.env.BETTER_AUTH_SECRET ??= "zaimu-e2e-secret-with-at-least-32-characters";
		({ server } = await import("../src/server"));
		({ closeDatabase, db, executeStatement, queryRows } = await import("sql"));
	});

	afterAll(async () => {
		if (userIds.length > 0)
			await db.orm.public.User.where(fields => fields.id.in(userIds as never)).deleteAndCount();
		await closeDatabase();
	});

	test("auth, ownership, CRUD, arithmetic, aggregates, and empty sync", async () => {
		const owner = await createSession("owner");
		const outsider = await createSession("outsider");
		const accountName = `Conta ${crypto.randomUUID()}`;

		const accountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ institutionName: "Mercado Pago", name: accountName, type: "CHECKING" },
			owner.cookie,
		);
		expect(accountResponse.status).toBe(200);
		const account = (await accountResponse.json()) as {
			balance: number;
			id: string;
			institution: { id: string; name: string };
		};
		expect(account.balance).toBe(0);
		expect(typeof account.balance).toBe("number");
		expect(account.institution.name).toBe("Mercado Pago");
		const cashAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ name: `Dinheiro ${crypto.randomUUID()}`, type: "CASH" },
			owner.cookie,
		);
		expect(cashAccountResponse.status).toBe(200);
		const cashAccount = (await cashAccountResponse.json()) as { id: string };

		const unnamedAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ institutionName: "Mercado Pago", type: "SAVINGS" },
			owner.cookie,
		);
		expect(unnamedAccountResponse.status).toBe(200);
		const unnamedAccount = (await unnamedAccountResponse.json()) as { id: string; name: string | null };
		expect(unnamedAccount.name).toBeNull();

		const creditCardResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{
				creditCard: {
					creditLimit: 1500,
					dueDay: 17,
					securityDeposit: 500,
					statementDay: 10,
				},
				institutionName: " mercado   PAGO ",
				name: accountName,
				type: "CREDIT_CARD",
			},
			owner.cookie,
		);
		expect(creditCardResponse.status).toBe(200);
		const creditCardAccount = (await creditCardResponse.json()) as {
			balance: number | null;
			creditCard: { id: string; securityDeposit: number | null };
			id: string;
			institution: { id: string };
		};
		expect(creditCardAccount.balance).toBeNull();
		expect(creditCardAccount.creditCard.securityDeposit).toBe(500);
		expect(creditCardAccount.institution.id).toBe(account.institution.id);

		const accountsResponse = await jsonRequest("/financial-accounts/", "GET", undefined, owner.cookie);
		expect(accountsResponse.status).toBe(200);
		const accounts = (await accountsResponse.json()) as Array<{
			id: string;
			creditCard?: {
				creditLimit: number;
				dueDay: number;
				securityDeposit: number | null;
				statementDay: number;
				workingDueDate: boolean;
			} | null;
		}>;
		expect(accounts.find(item => item.id === creditCardAccount.id)?.creditCard).toMatchObject({
			creditLimit: 1500,
			dueDay: 17,
			securityDeposit: 500,
			statementDay: 10,
			workingDueDate: false,
		});

		const duplicateAccount = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ institutionName: "Mercado Pago", name: accountName, type: "CHECKING" },
			owner.cookie,
		);
		expect(duplicateAccount.status).toBe(409);
		expect(await duplicateAccount.json()).toEqual({
			error: "Já existe uma conta desse tipo com este nome",
		});

		const clearNameResponse = await jsonRequest(
			`/financial-accounts/${account.id}`,
			"PATCH",
			{ name: null },
			owner.cookie,
		);
		expect(clearNameResponse.status).toBe(200);
		expect(((await clearNameResponse.json()) as { name: string | null }).name).toBeNull();

		const creditCardTransaction = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 10,
				date: "2026-08-23",
				originFinancialAccountId: creditCardAccount.id,
				type: "EXPENSE",
			},
			owner.cookie,
		);
		expect(creditCardTransaction.status).toBe(400);
		expect(await creditCardTransaction.json()).toEqual({
			error: "Cartão de crédito não possui saldo próprio",
		});

		const forbidden = await jsonRequest(
			`/financial-accounts/${account.id}`,
			"GET",
			undefined,
			outsider.cookie,
		);
		expect(forbidden.status).toBe(404);

		const categoryResponse = await jsonRequest(
			"/categories/",
			"POST",
			{ color: "#123456", name: `Categoria ${crypto.randomUUID()}` },
			owner.cookie,
		);
		expect(categoryResponse.status).toBe(200);
		const category = (await categoryResponse.json()) as { id: string };
		const secondCategoryResponse = await jsonRequest(
			"/categories/",
			"POST",
			{ name: `Categoria ${crypto.randomUUID()}` },
			owner.cookie,
		);
		expect(secondCategoryResponse.status).toBe(200);
		const secondCategory = (await secondCategoryResponse.json()) as { id: string };

		const recurringResponse = await jsonRequest(
			"/recurring/",
			"POST",
			{
				amount: 80,
				dayOfMonth: 10,
				financialAccountId: cashAccount.id,
				frequency: "MONTHLY",
				name: "Recorrência com tags",
				startDate: "2026-08-01",
				storeName: "Academia do bairro",
				tagIds: [category.id, secondCategory.id],
			},
			owner.cookie,
		);
		expect(recurringResponse.status).toBe(200);
		const recurring = (await recurringResponse.json()) as { id: string; storeName: string; tagIds: string[] };
		expect(recurring.tagIds).toEqual(expect.arrayContaining([category.id, secondCategory.id]));
		expect(recurring.storeName).toBe("Academia do bairro");

		const recurringWithoutWeekdayResponse = await jsonRequest(
			"/recurring/",
			"POST",
			{
				amount: 80,
				dayOfMonth: 10,
				dayOfWeek: null,
				frequency: "MONTHLY",
				name: "Recorrência mensal sem dia da semana",
				startDate: "2026-08-01",
			},
			owner.cookie,
		);
		expect(recurringWithoutWeekdayResponse.status).toBe(200);

		const recurringTransactionResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 80,
				date: "2026-08-10",
				recurrenceId: recurring.id,
				type: "EXPENSE",
			},
			owner.cookie,
		);
		expect(recurringTransactionResponse.status).toBe(200);
		const recurringTransaction = (await recurringTransactionResponse.json()) as {
			id: string;
			storeName: string;
			tagIds: string[];
		};
		expect(recurringTransaction.tagIds).toEqual(expect.arrayContaining([category.id, secondCategory.id]));
		expect(recurringTransaction.storeName).toBe("Academia do bairro");
		const hideTransactionResponse = await jsonRequest(
			`/transactions/${recurringTransaction.id}`,
			"PATCH",
			{ isHidden: true },
			owner.cookie,
		);
		expect(hideTransactionResponse.status).toBe(200);
		expect((await hideTransactionResponse.json()) as { isHidden: boolean }).toMatchObject({ isHidden: true });
		expect(
			(
				await jsonRequest(
					`/transactions/${recurringTransaction.id}`,
					"PATCH",
					{ date: "2026-08-28" },
					owner.cookie,
				)
			).status,
		).toBe(200);
		const repeatedRecurringTransactionResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 80,
				date: "2026-08-10",
				recurrenceId: recurring.id,
				recurrenceOccurrenceDate: "2026-08-10",
				type: "EXPENSE",
			},
			owner.cookie,
		);
		expect(repeatedRecurringTransactionResponse.status).toBe(200);
		expect(await repeatedRecurringTransactionResponse.json()).toMatchObject({
			date: "2026-08-28T00:00:00.000Z",
			id: recurringTransaction.id,
		});

		const updatedRecurringResponse = await jsonRequest(
			`/recurring/${recurring.id}`,
			"PATCH",
			{ tagIds: [secondCategory.id] },
			owner.cookie,
		);
		expect(updatedRecurringResponse.status).toBe(200);
		const updatedRecurringTransactionResponse = await jsonRequest(
			`/transactions/${recurringTransaction.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(updatedRecurringTransactionResponse.status).toBe(200);
		expect(
			((await updatedRecurringTransactionResponse.json()) as { tagIds: string[] }).tagIds.toSorted(),
		).toEqual([category.id, secondCategory.id].toSorted());
		const editedRecurrence = await jsonRequest(`/recurring/${recurring.id}`, "GET", undefined, owner.cookie);
		expect((await editedRecurrence.json()) as { tagIds: string[] }).toMatchObject({
			tagIds: [secondCategory.id],
		});

		const historyEdit = await jsonRequest(
			`/recurring/${recurring.id}`,
			"PATCH",
			{ amount: 175, name: "Academia atualizada" },
			owner.cookie,
		);
		expect(historyEdit.status).toBe(200);
		const historyResponse = await jsonRequest(
			`/recurring/${recurring.id}/history?limit=1`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(historyResponse.status).toBe(200);
		const historyPage = (await historyResponse.json()) as {
			items: Array<{ id: string }>;
			nextCursor: string;
			hasMore: boolean;
		};
		expect(historyPage.items).toHaveLength(1);
		expect(historyPage.hasMore).toBe(true);
		const historyNext = await jsonRequest(
			`/recurring/${recurring.id}/history?limit=1&cursor=${encodeURIComponent(historyPage.nextCursor)}`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(historyNext.status).toBe(200);
		expect(((await historyNext.json()) as { items: Array<{ id: string }> }).items[0]!.id).not.toBe(
			historyPage.items[0]!.id,
		);
		const otherHistory = await jsonRequest(
			`/recurring/${recurring.id}/history?cursor=${encodeURIComponent(historyPage.nextCursor)}`,
			"GET",
			undefined,
			outsider.cookie,
		);
		expect(otherHistory.status).toBe(400);
		const invalidHistory = await jsonRequest(
			`/recurring/${recurring.id}/history?cursor=invalid`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(invalidHistory.status).toBe(400);

		const salaryResponse = await jsonRequest(
			"/salaries/",
			"POST",
			{
				amount: 5000,
				financialAccountId: account.id,
				payDay: 10,
				source: "Salário com tags",
				startDate: "2026-08-01",
				tagIds: [category.id],
			},
			owner.cookie,
		);
		expect(salaryResponse.status).toBe(200);
		const salary = (await salaryResponse.json()) as { id: string; tagIds: string[] };
		expect(salary.tagIds).toEqual([category.id]);
		const salaryToCashResponse = await jsonRequest(
			"/salaries/",
			"POST",
			{
				amount: 5000,
				financialAccountId: cashAccount.id,
				payDay: 10,
				source: "Salário em dinheiro",
				startDate: "2026-08-01",
			},
			owner.cookie,
		);
		expect(salaryToCashResponse.status).toBe(200);
		const salaryToSavingsResponse = await jsonRequest(
			"/salaries/",
			"POST",
			{
				amount: 5000,
				financialAccountId: unnamedAccount.id,
				payDay: 10,
				source: "Salário em poupança",
				startDate: "2026-08-01",
			},
			owner.cookie,
		);
		expect(salaryToSavingsResponse.status).toBe(200);

		const salaryTransactionResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 5000,
				date: "2026-08-10",
				recurrenceId: salary.id,
				type: "INCOME",
			},
			owner.cookie,
		);
		expect(salaryTransactionResponse.status).toBe(200);
		const salaryTransaction = (await salaryTransactionResponse.json()) as { id: string; tagIds: string[] };
		expect(salaryTransaction.tagIds).toEqual([category.id]);
		const repeatedSalaryTransactionResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 5000,
				date: "2026-08-10",
				recurrenceId: salary.id,
				type: "INCOME",
			},
			owner.cookie,
		);
		expect(repeatedSalaryTransactionResponse.status).toBe(200);
		expect(((await repeatedSalaryTransactionResponse.json()) as { id: string }).id).toBe(
			salaryTransaction.id,
		);

		const subscriptionResponse = await jsonRequest(
			"/subscriptions/",
			"POST",
			{
				amount: 30,
				billingDay: 10,
				financialAccountId: creditCardAccount.id,
				frequency: "MONTHLY",
				name: "Assinatura com tags",
				paymentMethod: "CREDIT",
				startDate: "2026-08-01",
				storeName: "Streaming Brasil",
				tagIds: [secondCategory.id],
			},
			owner.cookie,
		);
		expect(subscriptionResponse.status).toBe(200);
		const subscription = (await subscriptionResponse.json()) as {
			id: string;
			storeName: string;
			tagIds: string[];
		};
		expect(subscription.tagIds).toEqual([secondCategory.id]);
		expect(subscription.storeName).toBe("Streaming Brasil");
		const initialSubscriptionPurchaseResponse = await jsonRequest(
			`/credit-cards/${creditCardAccount.creditCard.id}/purchases`,
			"POST",
			{
				description: "Assinatura com tags",
				purchaseDate: "2026-08-10",
				storeName: "Streaming Brasil",
				subscriptionId: subscription.id,
				subscriptionOccurrenceDate: "2026-08-10",
				totalAmount: 30,
			},
			owner.cookie,
		);
		expect(initialSubscriptionPurchaseResponse.status).toBe(200);
		const [initialSubscriptionPurchase] = (await initialSubscriptionPurchaseResponse.json()) as Array<{
			id: string;
		}>;
		const subscriptionStatementsResponse = await jsonRequest(
			`/credit-cards/${creditCardAccount.creditCard.id}/statements`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(subscriptionStatementsResponse.status).toBe(200);
		const linkedSubscriptionPurchases = await queryRows(
			db.sql.public.CreditPurchaseRecord.select("id", "subscriptionOccurrenceDate")
				.where((fields, functions) => functions.eq(fields.subscriptionId, subscription.id))
				.build(),
		);
		expect(linkedSubscriptionPurchases).toHaveLength(1);
		expect(linkedSubscriptionPurchases[0]?.id).toBe(initialSubscriptionPurchase?.id);
		const repeatedLinkedPurchaseResponse = await jsonRequest(
			`/credit-cards/${creditCardAccount.creditCard.id}/purchases`,
			"POST",
			{
				description: "Assinatura com tags",
				purchaseDate: "2026-08-10",
				storeName: "Streaming Brasil",
				subscriptionId: subscription.id,
				subscriptionOccurrenceDate: "2026-08-10",
				totalAmount: 30,
			},
			owner.cookie,
		);
		expect(repeatedLinkedPurchaseResponse.status).toBe(200);
		expect(((await repeatedLinkedPurchaseResponse.json()) as Array<{ id: string }>)[0]?.id).toBe(
			initialSubscriptionPurchase?.id,
		);
		const futureStatement = (
			(await subscriptionStatementsResponse.json()) as { items: Array<{ id: string; isForecast?: boolean }> }
		).items.find(statement => statement.isForecast);
		expect(futureStatement).toBeDefined();
		const futureStatementResponse = await jsonRequest(
			`/credit-cards/${creditCardAccount.creditCard.id}/statements/${futureStatement!.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(futureStatementResponse.status).toBe(200);
		expect(
			((await futureStatementResponse.json()) as { purchases: Array<{ id: string; storeName: string }> })
				.purchases,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					isForecast: true,
					storeName: "Streaming Brasil",
					subscriptionId: subscription.id,
				}),
			]),
		);

		const updateSubscriptionResponse = await jsonRequest(
			`/subscriptions/${subscription.id}`,
			"PATCH",
			{
				amount: 45,
				billingDay: 15,
				name: "Assinatura atualizada",
				tagIds: [category.id],
			},
			owner.cookie,
		);
		expect(updateSubscriptionResponse.status).toBe(200);
		await jsonRequest(
			`/credit-cards/${creditCardAccount.creditCard.id}/statements`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(
			await queryRows(
				db.sql.public.CreditPurchaseRecord.select("id")
					.where((fields, functions) => functions.eq(fields.subscriptionId, subscription.id))
					.build(),
			),
		).toHaveLength(1);
		const today = new Date().toISOString().slice(0, 10);
		const dueTodaySubscriptionResponse = await jsonRequest(
			"/subscriptions/",
			"POST",
			{
				amount: 12.5,
				billingDay: Number(today.slice(8, 10)),
				financialAccountId: creditCardAccount.id,
				frequency: "MONTHLY",
				name: "Assinatura vencendo hoje",
				paymentMethod: "CREDIT",
				startDate: today,
				storeName: "Loja da ocorrência atual",
			},
			owner.cookie,
		);
		expect(dueTodaySubscriptionResponse.status).toBe(200);
		const dueTodaySubscription = (await dueTodaySubscriptionResponse.json()) as { id: string };
		const { materializeRecurrence } = await import("../src/modules/recurring/application/recurrences");
		await Promise.all([
			materializeRecurrence(owner.userId, dueTodaySubscription.id, today),
			materializeRecurrence(owner.userId, dueTodaySubscription.id, today),
		]);
		await Promise.all([
			jsonRequest(
				`/credit-cards/${creditCardAccount.creditCard.id}/statements`,
				"GET",
				undefined,
				owner.cookie,
			),
			jsonRequest(
				`/credit-cards/${creditCardAccount.creditCard.id}/statements`,
				"GET",
				undefined,
				owner.cookie,
			),
		]);
		const dueTodayPurchases = await queryRows(
			db.sql.public.CreditPurchaseRecord.select("storeName", "subscriptionOccurrenceDate")
				.where((fields, functions) => functions.eq(fields.subscriptionId, dueTodaySubscription.id))
				.build(),
		);
		expect(dueTodayPurchases).toHaveLength(1);
		expect(dueTodayPurchases[0]).toMatchObject({ storeName: "Loja da ocorrência atual" });
		expect(dueTodayPurchases[0]?.subscriptionOccurrenceDate?.toISOString().slice(0, 10)).toBe(today);

		const incomeResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 19.75,
				categoryId: category.id,
				date: "2026-08-23",
				destinationFinancialAccountId: account.id,
				time: "08:15",
				type: "INCOME",
			},
			owner.cookie,
		);
		expect(incomeResponse.status).toBe(200);
		const income = (await incomeResponse.json()) as { amount: number; id: string; time: string };
		expect(income.amount).toBe(19.75);
		expect(income.time).toStartWith("08:15");

		const transactionsResponse = await jsonRequest("/transactions/", "GET", undefined, owner.cookie);
		expect(transactionsResponse.status).toBe(200);
		const transactionPage = (await transactionsResponse.json()) as {
			days: Array<{
				transactions: Array<{
					id: string;
					destinationName: string | null;
					sourceName: string | null;
				}>;
			}>;
		};
		const transactions = transactionPage.days.flatMap(day => day.transactions);
		expect(transactions.find(transaction => transaction.id === income.id)).toMatchObject({
			destinationName: "Mercado Pago",
			sourceName: "Mercado Pago",
		});

		const updatedAccount = await jsonRequest(
			`/financial-accounts/${account.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(((await updatedAccount.json()) as { balance: number }).balance).toBe(5019.75);

		const destinationResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ name: `Destino ${crypto.randomUUID()}`, type: "SAVINGS" },
			owner.cookie,
		);
		const destination = (await destinationResponse.json()) as { id: string };
		expect(destinationResponse.status).toBe(200);

		const expenseResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 10,
				date: "2026-08-23",
				originFinancialAccountId: account.id,
				storeName: "Mercado do bairro",
				type: "EXPENSE",
			},
			owner.cookie,
		);
		const expense = (await expenseResponse.json()) as { id: string; storeName: string };
		expect(expenseResponse.status).toBe(200);
		expect(expense.storeName).toBe("Mercado do bairro");

		const transferResponse = await jsonRequest(
			"/transactions/",
			"POST",
			{
				amount: 20,
				date: "2026-08-23",
				destinationFinancialAccountId: destination.id,
				originFinancialAccountId: account.id,
				type: "TRANSFER",
			},
			owner.cookie,
		);
		const transfer = (await transferResponse.json()) as { id: string };
		expect(transferResponse.status).toBe(200);

		const transferredOrigin = await jsonRequest(
			`/financial-accounts/${account.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		const transferredDestination = await jsonRequest(
			`/financial-accounts/${destination.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(((await transferredOrigin.json()) as { balance: number }).balance).toBe(4989.75);
		expect(((await transferredDestination.json()) as { balance: number }).balance).toBe(20);

		expect(
			(await jsonRequest(`/transactions/${transfer.id}`, "DELETE", undefined, owner.cookie)).status,
		).toBe(200);
		expect((await jsonRequest(`/transactions/${expense.id}`, "DELETE", undefined, owner.cookie)).status).toBe(
			200,
		);

		const cardAccountName = `Cartão ${crypto.randomUUID()}`;
		const cardAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{
				creditCard: { creditLimit: 1500, dueDay: 10, statementDay: 3 },
				name: cardAccountName,
				type: "CREDIT_CARD",
			},
			owner.cookie,
		);
		const cardAccount = (await cardAccountResponse.json()) as { creditCard: { id: string } };
		expect(cardAccountResponse.status).toBe(200);
		const emptyStatementsResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/statements`,
			"GET",
			undefined,
			owner.cookie,
		);
		const emptyStatements = (
			(await emptyStatementsResponse.json()) as { items: Array<{ totalAmount: number }> }
		).items;
		expect(emptyStatementsResponse.status).toBe(200);
		expect(emptyStatements).toBeArray();

		const purchaseResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/purchases`,
			"POST",
			{
				description: "Compra sem categoria",
				installments: 2,
				purchaseDate: "2026-08-02",
				storeName: "Livraria Central",
				time: "14:30",
				totalAmount: 99.9,
			},
			owner.cookie,
		);
		const purchases = (await purchaseResponse.json()) as Array<{
			categoryId: null;
			id: string;
			installmentAmount: number;
			statementId: string;
			storeName: string;
			time: string;
			totalAmount: number;
		}>;
		expect(purchaseResponse.status).toBe(200);
		expect(purchases).toHaveLength(2);
		expect(new Set(purchases.map(purchase => purchase.statementId)).size).toBe(2);
		expect(purchases[0]?.categoryId).toBeNull();
		expect(purchases[0]?.installmentAmount).toBe(49.95);
		expect(purchases[0]?.storeName).toBe("Livraria Central");
		expect(purchases[0]?.time).toStartWith("14:30");

		const purchaseTransactionsResponse = await jsonRequest("/transactions/", "GET", undefined, owner.cookie);
		const purchaseTransactions = (
			(await purchaseTransactionsResponse.json()) as {
				days: Array<{
					transactions: Array<{
						id: string;
						storeName: string | null;
						time: string | null;
					}>;
				}>;
			}
		).days.flatMap(day => day.transactions);
		expect(purchaseTransactionsResponse.status).toBe(200);
		expect(purchaseTransactions.find(transaction => transaction.id === purchases[0]?.id)?.storeName).toBe(
			"Livraria Central",
		);
		expect(purchaseTransactions.find(transaction => transaction.id === purchases[0]?.id)?.time).toStartWith(
			"14:30",
		);
		expect(typeof purchases[0]?.totalAmount).toBe("number");
		const statementsAfterInstallmentPurchase = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/statements`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(statementsAfterInstallmentPurchase.status).toBe(200);
		expect(
			await queryRows(
				db.sql.public.CreditInstallmentRecord.select("id")
					.where((fields, functions) => functions.eq(fields.purchaseId, purchases[0]!.id))
					.build(),
			),
		).toHaveLength(2);

		const statementsResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/statements`,
			"GET",
			undefined,
			owner.cookie,
		);
		const statement = (
			(await statementsResponse.json()) as {
				items: Array<{
					id: string;
					statementDate: string;
					totalAmount: number;
				}>;
			}
		).items;
		expect(statementsResponse.status).toBe(200);
		expect(statement.map(item => item.id)).toEqual(
			expect.arrayContaining(purchases.map(purchase => purchase.statementId)),
		);
		const statementToPay = statement
			.filter(item => item.totalAmount > 0)
			.toSorted((left, right) => left.statementDate.localeCompare(right.statementDate))[0]!;
		expect(statementToPay.totalAmount).toBe(49.95);
		const statementPaymentResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/payments`,
			"POST",
			{
				amount: 60,
				date: "2026-08-23",
				financialAccountId: account.id,
				time: "18:45",
			},
			owner.cookie,
		);
		expect(statementPaymentResponse.status).toBe(200);
		const statementPayment = (await statementPaymentResponse.json()) as {
			transaction: {
				amount: number;
				paymentCreditCardId: string;
				description: string;
				id: string;
				time: string;
				type: string;
			};
		};
		expect(statementPayment.transaction).toMatchObject({
			amount: 60,
			description: "Pagamento do cartão",
			paymentCreditCardId: cardAccount.creditCard.id,
			time: expect.stringMatching(/^18:45/),
			type: "EXPENSE",
		});
		const transactionsAfterStatementPayment = (
			(await (await jsonRequest("/transactions/", "GET", undefined, owner.cookie)).json()) as {
				days: Array<{
					transactions: Array<{
						creditCardName: string | null;
						creditCardStatementDate: string | null;
						id: string;
					}>;
				}>;
			}
		).days.flatMap(day => day.transactions);
		expect(
			transactionsAfterStatementPayment.find(
				transaction => transaction.id === statementPayment.transaction.id,
			),
		).toMatchObject({
			creditCardName: cardAccountName,
			creditCardStatementDate: null,
		});
		const paidStatementDetailResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/statements/${statementToPay.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		const paidStatementDetail = (await paidStatementDetailResponse.json()) as {
			payments: Array<{ amount: number; id: string }>;
		};
		expect(paidStatementDetailResponse.status).toBe(200);
		expect(paidStatementDetail.payments).toEqual([]);
		const paymentCycle = (
			(await (
				await jsonRequest(
					`/credit-cards/${cardAccount.creditCard.id}/statements`,
					"GET",
					undefined,
					owner.cookie,
				)
			).json()) as { items: Array<{ id: string; statementDate: string }> }
		).items.find(item => item.statementDate.startsWith("2026-09"));
		const paymentCycleDetail = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/statements/${paymentCycle!.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		expect(((await paymentCycleDetail.json()) as { payments: Array<{ id: string }> }).payments).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: statementPayment.transaction.id })]),
		);
		const openStatementsResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/statements?isPaid=false`,
			"GET",
			undefined,
			owner.cookie,
		);
		const openStatements = (
			(await openStatementsResponse.json()) as {
				items: Array<{
					balanceAmount: number;
				}>;
			}
		).items;
		expect(openStatementsResponse.status).toBe(200);
		expect(openStatements.some(item => item.balanceAmount === 39.9)).toBeTrue();

		const editedStatementPaymentResponse = await jsonRequest(
			`/transactions/${statementPayment.transaction.id}`,
			"PATCH",
			{
				amount: 40,
				date: "2026-08-24",
				originFinancialAccountId: account.id,
				paymentCreditCardId: cardAccount.creditCard.id,
				time: "20:15",
			},
			owner.cookie,
		);
		expect(editedStatementPaymentResponse.status).toBe(200);
		expect((await editedStatementPaymentResponse.json()) as { amount: number; time: string }).toMatchObject({
			amount: 40,
			time: expect.stringMatching(/^20:15/),
		});
		const statementAfterPaymentEdit = (await (
			await jsonRequest(
				`/credit-cards/${cardAccount.creditCard.id}/statements/${statementToPay.id}`,
				"GET",
				undefined,
				owner.cookie,
			)
		).json()) as {
			isPaid: boolean;
			paidAmount: number;
			payments: Array<{ amount: number; date: string; id: string; time: string }>;
		};
		expect(statementAfterPaymentEdit).toMatchObject({ isPaid: false, paidAmount: 0, payments: [] });
		const concurrentPayments = await Promise.all(
			[10, 20].map(amount =>
				jsonRequest(
					"/transactions/",
					"POST",
					{
						amount,
						date: "2026-08-25",
						originFinancialAccountId: account.id,
						paymentCreditCardId: cardAccount.creditCard.id,
						type: "EXPENSE",
					},
					owner.cookie,
				),
			),
		);
		expect(concurrentPayments.map(response => response.status)).toEqual([200, 200]);
		const statementAfterConcurrentPayments = (await (
			await jsonRequest(
				`/credit-cards/${cardAccount.creditCard.id}/statements/${statementToPay.id}`,
				"GET",
				undefined,
				owner.cookie,
			)
		).json()) as { paidAmount: number };
		expect(statementAfterConcurrentPayments.paidAmount).toBe(0);

		const lifecycleCases = [
			{
				create: {
					amount: 45,
					dayOfMonth: 5,
					financialAccountId: account.id,
					frequency: "MONTHLY",
					name: "Recorrência",
					startDate: "2026-08-01",
				},
				numericField: "amount",
				path: "/recurring",
				update: { amount: 48, categoryId: null, dayOfMonth: 7, endDate: null },
			},
			{
				create: {
					amount: 4200,
					financialAccountId: account.id,
					payDay: 5,
					source: "Empresa",
					startDate: "2026-08-01",
				},
				numericField: "amount",
				path: "/salaries",
				update: { amount: 5100, endDate: null, isActive: false },
			},
			{
				create: {
					amount: 29.9,
					billingDay: 12,
					financialAccountId: account.id,
					name: "Serviço",
					startDate: "2026-08-01",
				},
				numericField: "amount",
				path: "/subscriptions",
				update: { amount: 32.5, endDate: null, isActive: false },
			},
		] as const;

		for (const lifecycle of lifecycleCases) {
			const createdResponse = await jsonRequest(`${lifecycle.path}/`, "POST", lifecycle.create, owner.cookie);
			const created = (await createdResponse.json()) as Record<string, unknown> & { id: string };
			expect(createdResponse.status).toBe(200);
			expect(typeof created[lifecycle.numericField]).toBe("number");

			const updateResponse = await jsonRequest(
				`${lifecycle.path}/${created.id}`,
				"PATCH",
				lifecycle.update,
				owner.cookie,
			);
			expect(updateResponse.status).toBe(200);
			const updated = (await updateResponse.json()) as { endDate?: null };
			if ("endDate" in lifecycle.update) expect(updated.endDate).toBeNull();

			const historyResponse = await jsonRequest(
				`${lifecycle.path}/${created.id}/history`,
				"GET",
				undefined,
				owner.cookie,
			);
			expect(historyResponse.status).toBe(200);
			const history = (await historyResponse.json()) as unknown[] | { items: unknown[] };
			expect((Array.isArray(history) ? history : history.items).length).toBeGreaterThan(0);
		}

		const dashboard = await jsonRequest("/dashboard/", "GET", undefined, owner.cookie);
		expect(dashboard.status).toBe(200);
		expect((await dashboard.json()) as { accounts: Array<{ id: string; balance: number }> }).toMatchObject({
			accounts: expect.arrayContaining([
				expect.objectContaining({ balance: expect.any(Number), id: account.id }),
			]),
		});
		const beforeIncomeDeletion = await jsonRequest(
			`/financial-accounts/${account.id}`,
			"GET",
			undefined,
			owner.cookie,
		);
		const beforeIncomeDeletionBalance = ((await beforeIncomeDeletion.json()) as { balance: number }).balance;

		const deletion = await jsonRequest(`/transactions/${income.id}`, "DELETE", undefined, owner.cookie);
		expect(deletion.status).toBe(200);
		const reversed = await jsonRequest(`/financial-accounts/${account.id}`, "GET", undefined, owner.cookie);
		expect(((await reversed.json()) as { balance: number }).balance).toBeCloseTo(
			beforeIncomeDeletionBalance - income.amount,
			2,
		);

		const outsiderAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ name: `Externa ${crypto.randomUUID()}`, type: "CHECKING" },
			outsider.cookie,
		);
		const outsiderAccount = (await outsiderAccountResponse.json()) as { id: string };
		const conflictSync = await jsonRequest(
			"/sync/",
			"POST",
			{
				financialAccounts: [{ id: outsiderAccount.id, name: "Tentativa indevida", type: "CHECKING" }],
			},
			owner.cookie,
		);
		const conflictResult = (await conflictSync.json()) as {
			syncResults: { financialAccounts: { errors: string[]; synced: number } };
		};
		expect(conflictSync.status).toBe(200);
		expect(conflictResult.syncResults.financialAccounts.synced).toBe(0);
		expect(conflictResult.syncResults.financialAccounts.errors).toHaveLength(1);

		const bulkSync = await jsonRequest(
			"/sync/",
			"POST",
			{
				financialAccounts: [
					{ id: crypto.randomUUID(), name: `Offline A ${crypto.randomUUID()}`, type: "CASH" },
					{
						id: crypto.randomUUID(),
						name: `Offline B ${crypto.randomUUID()}`,
						type: "SAVINGS",
					},
				],
			},
			owner.cookie,
		);
		const bulkResult = (await bulkSync.json()) as {
			syncResults: { financialAccounts: { errors: string[]; synced: number } };
		};
		expect(bulkSync.status).toBe(200);
		expect(bulkResult.syncResults.financialAccounts.synced).toBe(2);
		expect(bulkResult.syncResults.financialAccounts.errors).toHaveLength(0);

		const sync = await jsonRequest("/sync/", "POST", {}, owner.cookie);
		expect(sync.status).toBe(200);
		const syncBody = (await sync.json()) as { syncResults: Record<string, { synced: number }> };
		expect(Object.values(syncBody.syncResults).every(result => result.synced === 0)).toBe(true);
	});

	test("shared debt ledger keeps one bilateral balance and sanitizes remote history", async () => {
		const owner = await createSession("debt-owner");
		const peer = await createSession("debt_peer");
		const declinedPeer = await createSession("debt-declined");
		const date = "2026-09-01";
		const createPerson = await jsonRequest(
			"/debts/people",
			"POST",
			{ name: "Pessoa compartilhada" },
			owner.cookie,
		);
		expect(createPerson.status).toBe(200);
		const ownerPerson = (await createPerson.json()) as { id: string };

		for (const amount of [100, 50]) {
			const origin = await jsonRequest(
				"/debts/events",
				"POST",
				{ amount, date, description: `Origem ${amount}`, isOwedToMe: true, personId: ownerPerson.id },
				owner.cookie,
			);
			expect(origin.status).toBe(200);
		}

		const wildcardEmail = peer.email.replace(/-[0-9a-f]/, "-_");
		const wildcardLookup = await jsonRequest(
			`/debts/people/${ownerPerson.id}/invite`,
			"POST",
			{ email: wildcardEmail },
			owner.cookie,
		);
		expect(wildcardLookup.status).toBe(404);

		const invitationResponse = await jsonRequest(
			`/debts/people/${ownerPerson.id}/invite`,
			"POST",
			{ email: peer.email },
			owner.cookie,
		);
		expect(invitationResponse.status).toBe(200);
		const invitation = (await invitationResponse.json()) as { id: string };
		const invitationsResponse = await jsonRequest("/debts/invitations", "GET", undefined, peer.cookie);
		const invitations = (await invitationsResponse.json()) as Record<string, unknown>[];
		expect(invitationsResponse.status).toBe(200);
		expect(invitations[0]).toMatchObject({ direction: "RECEIVED", status: "PENDING" });
		expect(invitations[0]).not.toHaveProperty("balance");
		const invitationPreview = await jsonRequest(
			`/debts/invitations/${invitation.id}/preview`,
			"GET",
			undefined,
			peer.cookie,
		);
		expect(invitationPreview.status).toBe(200);
		expect(await invitationPreview.json()).toMatchObject({ balance: -150 });
		expect(invitations[0]).not.toHaveProperty("requesterEmail");

		const privateLedger = await jsonRequest("/debts", "GET", undefined, peer.cookie);
		expect((await privateLedger.json()) as { people: unknown[] }).toMatchObject({ people: [] });
		const accept = await jsonRequest(`/debts/invitations/${invitation.id}/accept`, "POST", {}, peer.cookie);
		expect(accept.status).toBe(200);

		interface Ledger {
			people: Array<{
				balance: number;
				events: Array<Record<string, unknown> & { amount: number; effect: number; id: string }>;
				id: string;
			}>;
		}
		const ownerLedgerResponse = await jsonRequest("/debts", "GET", undefined, owner.cookie);
		const ownerLedger = await loadLedger(ownerLedgerResponse, owner.cookie);
		const peerLedgerResponse = await jsonRequest("/debts", "GET", undefined, peer.cookie);
		const peerLedger = await loadLedger(peerLedgerResponse, peer.cookie);
		expect(ownerLedger.people[0]?.balance).toBe(150);
		expect(peerLedger.people[0]?.balance).toBe(-150);
		expect(peerLedger.people[0]?.events).toHaveLength(2);

		const peerAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ name: `Conta dívida ${crypto.randomUUID()}`, type: "CHECKING" },
			peer.cookie,
		);
		const peerAccount = (await peerAccountResponse.json()) as { id: string };
		const paymentResponse = await jsonRequest(
			"/transactions",
			"POST",
			{
				amount: 50,
				date,
				debtSplit: {
					mode: "SHARES",
					ownerShares: null,
					participants: [{ debtPersonId: peerLedger.people[0]!.id, shares: 1 }],
				},
				description: "Pagamento privado",
				originFinancialAccountId: peerAccount.id,
				storeName: "Metadado privado",
				type: "EXPENSE",
			},
			peer.cookie,
		);
		expect(paymentResponse.status).toBe(200);
		const payment = (await paymentResponse.json()) as { id: string };

		const ledgerAfterPayment = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, owner.cookie),
			owner.cookie,
		);
		expect(ledgerAfterPayment.people[0]?.balance).toBe(100);
		const sharedPayment = ledgerAfterPayment.people[0]?.events.find(
			event => event.amount === 50 && event.effect === -50,
		);
		expect(sharedPayment).not.toHaveProperty("storeName");
		expect(sharedPayment).not.toHaveProperty("originFinancialAccountId");

		const ownerAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{ name: `Conta pareada ${crypto.randomUUID()}`, type: "CHECKING" },
			owner.cookie,
		);
		const ownerAccount = (await ownerAccountResponse.json()) as { id: string };
		const pairResponse = await jsonRequest(
			"/transactions",
			"POST",
			{
				amount: 50,
				date,
				destinationFinancialAccountId: ownerAccount.id,
				matchDebtEventId: sharedPayment!.id,
				type: "INCOME",
			},
			owner.cookie,
		);
		expect(pairResponse.status).toBe(200);
		const ledgerAfterPair = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, owner.cookie),
			owner.cookie,
		);
		expect(ledgerAfterPair.people[0]?.balance).toBe(100);
		expect(ledgerAfterPair.people[0]?.events).toHaveLength(3);

		const overpayment = await jsonRequest(
			"/transactions",
			"POST",
			{
				amount: 150,
				date,
				debtSplit: {
					mode: "SHARES",
					ownerShares: null,
					participants: [{ debtPersonId: peerLedger.people[0]!.id, shares: 1 }],
				},
				originFinancialAccountId: peerAccount.id,
				type: "EXPENSE",
			},
			peer.cookie,
		);
		expect(overpayment.status).toBe(200);
		const crossedOwnerLedger = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, owner.cookie),
			owner.cookie,
		);
		const crossedPeerLedger = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, peer.cookie),
			peer.cookie,
		);
		expect(crossedOwnerLedger.people[0]?.balance).toBe(-50);
		expect(crossedPeerLedger.people[0]?.balance).toBe(50);

		const cardAccountResponse = await jsonRequest(
			"/financial-accounts/",
			"POST",
			{
				creditCard: { creditLimit: 1000, dueDay: 20, statementDay: 10 },
				name: `Cartão dívida ${crypto.randomUUID()}`,
				type: "CREDIT_CARD",
			},
			owner.cookie,
		);
		const cardAccount = (await cardAccountResponse.json()) as { creditCard: { id: string } };
		const purchaseResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/purchases`,
			"POST",
			{
				debtSplit: {
					mode: "SHARES",
					ownerShares: null,
					participants: [{ debtPersonId: ownerPerson.id, shares: 1 }],
				},
				installments: 3,
				purchaseDate: date,
				storeName: "Mercado da esquina",
				totalAmount: 90,
			},
			owner.cookie,
		);
		expect(purchaseResponse.status).toBe(200);
		const purchases = (await purchaseResponse.json()) as Array<{ currentInstallment: number; id: string }>;
		expect(purchases.map(purchase => purchase.currentInstallment).toSorted()).toEqual([1, 2, 3]);
		const afterInstallments = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, owner.cookie),
			owner.cookie,
		);
		expect(afterInstallments.people[0]?.balance).toBe(40);
		expect(
			afterInstallments.people[0]?.events.filter(event => event.amount === 90 && event.effect === 90),
		).toEqual([expect.objectContaining({ description: "Mercado da esquina" })]);
		await executeStatement(
			db.sql.public.DebtEvent.update({ description: "Compra", updatedAt: new Date() })
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.debtPersonId, ownerPerson.id),
						functions.eq(fields.kind, "PURCHASE"),
					),
				)
				.build(),
		);
		const ledgerWithLegacyPurchaseEvent = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, owner.cookie),
			owner.cookie,
		);
		expect(
			ledgerWithLegacyPurchaseEvent.people[0]?.events.filter(
				event => event.amount === 90 && event.effect === 90,
			),
		).toEqual([expect.objectContaining({ description: "Mercado da esquina" })]);
		const rootPurchase = purchases.find(purchase => purchase.currentInstallment === 1)!;
		const refundResponse = await jsonRequest(
			`/credit-cards/${cardAccount.creditCard.id}/purchases/${rootPurchase.id}/refunds`,
			"POST",
			{ policy: "KEEP_INSTALLMENTS", purchaseDate: "2026-09-20" },
			owner.cookie,
		);
		expect(refundResponse.status).toBe(200);
		const refund = (await refundResponse.json()) as { id: string; isRefund: boolean; statementId: string };
		expect(refund.isRefund).toBe(true);
		expect((await jsonRequest("/transactions/", "GET", undefined, owner.cookie)).status).toBe(200);
		expect((await jsonRequest("/sync/", "POST", {}, owner.cookie)).status).toBe(200);
		expect(
			(
				await jsonRequest(
					`/credit-cards/${cardAccount.creditCard.id}/statements/${refund.statementId}`,
					"GET",
					undefined,
					owner.cookie,
				)
			).status,
		).toBe(200);
		expect(
			(
				await jsonRequest(
					`/credit-cards/${cardAccount.creditCard.id}/purchases/${refund.id}/refunds`,
					"POST",
					{ policy: "KEEP_INSTALLMENTS", purchaseDate: "2026-09-20" },
					owner.cookie,
				)
			).status,
		).toBe(400);
		expect(
			(await loadLedger(await jsonRequest("/debts", "GET", undefined, owner.cookie), owner.cookie)).people[0]
				?.balance,
		).toBe(-50);
		expect(
			(
				await jsonRequest(
					`/credit-cards/${cardAccount.creditCard.id}/purchases/${refund.id}`,
					"DELETE",
					undefined,
					owner.cookie,
				)
			).status,
		).toBe(200);
		expect(
			await queryRows(
				db.sql.public.DebtPurchaseLink.select("id")
					.where((fields, functions) => functions.eq(fields.creditPurchaseId, refund.id))
					.build(),
			),
		).toHaveLength(1);
		expect(
			await queryRows(
				db.sql.public.DebtSplit.select("id")
					.where((fields, functions) => functions.eq(fields.creditPurchaseId, refund.id))
					.build(),
			),
		).toEqual([]);
		expect(
			(await loadLedger(await jsonRequest("/debts", "GET", undefined, owner.cookie), owner.cookie)).people[0]
				?.balance,
		).toBe(40);
		expect(
			(
				await jsonRequest(
					`/credit-cards/${cardAccount.creditCard.id}/purchases/${rootPurchase.id}`,
					"DELETE",
					undefined,
					owner.cookie,
				)
			).status,
		).toBe(200);
		expect(
			(await loadLedger(await jsonRequest("/debts", "GET", undefined, owner.cookie), owner.cookie)).people[0]
				?.balance,
		).toBe(-50);

		const declinedPersonResponse = await jsonRequest(
			"/debts/people",
			"POST",
			{ name: "Convite recusado" },
			owner.cookie,
		);
		const declinedPerson = (await declinedPersonResponse.json()) as { id: string };
		const declinedInvitationResponse = await jsonRequest(
			`/debts/people/${declinedPerson.id}/invite`,
			"POST",
			{ email: declinedPeer.email },
			owner.cookie,
		);
		const declinedInvitation = (await declinedInvitationResponse.json()) as { id: string };
		expect(
			(
				await jsonRequest(
					`/debts/invitations/${declinedInvitation.id}/decline`,
					"POST",
					undefined,
					declinedPeer.cookie,
				)
			).status,
		).toBe(200);
		expect(
			(
				await loadLedger(
					await jsonRequest("/debts", "GET", undefined, declinedPeer.cookie),
					declinedPeer.cookie,
				)
			).people,
		).toHaveLength(0);

		expect((await jsonRequest(`/transactions/${payment.id}`, "DELETE", undefined, peer.cookie)).status).toBe(
			200,
		);
		const afterCreatorDeletion = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, owner.cookie),
			owner.cookie,
		);
		expect(afterCreatorDeletion.people.find(person => person.id === ownerPerson.id)?.events).toHaveLength(3);
		expect(
			(await jsonRequest(`/debts/people/${ownerPerson.id}`, "DELETE", undefined, owner.cookie)).status,
		).toBe(200);
		const peerAfterOwnerHide = await loadLedger(
			await jsonRequest("/debts", "GET", undefined, peer.cookie),
			peer.cookie,
		);
		expect(peerAfterOwnerHide.people[0]?.events.length).toBe(3);
	});
});
