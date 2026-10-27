import { afterAll, beforeAll, beforeEach, expect, setSystemTime, test } from "bun:test";
import { type CreditBook, newBookPurchase } from "@zaimu/finance/credit-book";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { FinancialAccount, LoanPayment, Transaction } from "../api";

const descriptors = new Map<string, PropertyDescriptor | undefined>();
const values = new Map<string, string>();
const owner = "guest:projection-regressions" as const;
let storage: typeof import("../localStorage");
let auth: typeof import("@/stores/auth").useAuthStore;
let previousAuth: ReturnType<typeof auth.getState>;
let comparison: typeof import("../dashboard-comparison").getGuestDashboardComparison;
let previousCurrency: string;
let currency: typeof import("../currency-context");

beforeAll(async () => {
	setSystemTime(new Date("2026-10-12T12:00:00Z"));
	const globals = {
		fetch: async () =>
			new Response(
				JSON.stringify({
					averages: { CDI: 0, SELIC: 0 },
					endDate: "2026-10-11",
					ready: true,
					startDate: "2016-10-12",
				}),
			),
		IDBKeyRange,
		indexedDB: new IDBFactory(),
		localStorage: {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => {
				values.delete(key);
			},
			setItem: (key: string, value: string) => {
				values.set(key, value);
			},
		},
		window: { location: { origin: "http://localhost" } },
	};
	for (const [name, value] of Object.entries(globals)) {
		descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
	}
	auth = (await import("@/stores/auth")).useAuthStore;
	previousAuth = auth.getState();
	auth.setState({
		guestId: "projection-regressions",
		isAuthenticated: false,
		isGuestMode: true,
		user: null,
	});
	storage = await import("../localStorage");
	currency = await import("../currency-context");
	previousCurrency = currency.activeCurrency();
	currency.setActiveCurrency("BRL");
	comparison = (await import("../dashboard-comparison")).getGuestDashboardComparison;
});
beforeEach(async () => {
	await storage.clearAllLocalData(owner);
});
afterAll(async () => {
	await storage.clearAllLocalData(owner);
	(await storage.initLocalDb()).close();
	auth.setState(previousAuth);
	currency.setActiveCurrency(previousCurrency);
	setSystemTime();
	for (const [name, descriptor] of descriptors) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
});

const november = { endDate: "2026-11-30", periodsAfter: 0, periodsBefore: 0, startDate: "2026-11-01" };
async function account(balance = 1000) {
	const row: FinancialAccount = {
		balance,
		createdAt: "2026-10-01",
		currency: "BRL",
		id: "checking",
		isPrimary: true,
		name: "Conta",
		type: "CASH",
		updatedAt: "2026-10-01",
		userId: "projection-regressions",
	};
	await storage.localAccounts.put(row, row.id, owner);
	await movement("opening-balance", "2026-10-01", balance, "INCOME");
}
async function movement(
	id: string,
	date: string,
	amount: number,
	type: Transaction["type"] = "EXPENSE",
	extra: Partial<Transaction> = {},
) {
	const row: Transaction = {
		amount,
		createdAt: "2026-10-01",
		date,
		id,
		type,
		...(type === "INCOME"
			? { destinationFinancialAccountId: "checking" }
			: { originFinancialAccountId: "checking" }),
		...extra,
	};
	await storage.localTransactions.put(row, id, owner);
}

test("PREV-001: future interval carries earlier movements only into its initial balance", async () => {
	await account();
	await movement("oct-income", "2026-10-20", 200, "INCOME");
	await movement("oct-expense", "2026-10-25", 50);
	await movement("nov-expense", "2026-11-05", 30);
	const [result] = await comparison(november);
	expect(result).toMatchObject({
		accountBalance: 1120,
		endingBalance: 1120,
		expenses: 30,
		income: 0,
		initialBalance: 1150,
		net: -30,
	});
});

test("PREV-002: inclusive calendar month excludes next day's transaction", async () => {
	await account();
	await movement("last-day", "2026-11-30", 10, "EXPENSE", { time: "23:59:59" });
	await movement("next-day", "2026-12-01", 900);
	const [result] = await comparison(november);
	expect(result).toMatchObject({
		endDate: "2026-11-30",
		endingBalance: 990,
		expenses: 10,
		initialBalance: 1000,
		startDate: "2026-11-01",
	});
});

test("PREV-004: forecast uses future unpaid installment amounts, not loan nominal value", async () => {
	await account();
	const rows: LoanPayment[] = [
		{ dueDate: "2026-10-10", id: "paid", paidDate: "2026-10-10", totalPaid: 100 },
		{ dueDate: "2026-10-12", id: "today", totalPaid: 77 },
		{ dueDate: "2026-11-04", id: "future-a", totalPaid: 61.23 },
		{ dueDate: "2026-11-20", id: "future-b", totalPaid: 48.77 },
	].map((row, index) => ({
		currency: "BRL",
		installmentNumber: index + 1,
		interestPaid: 0,
		isAdvanced: false,
		loanId: "loan",
		principalPaid: row.totalPaid,
		...row,
	}));
	for (const row of rows) await storage.localLoanPayments.put(row, row.id, owner);
	const [result] = await comparison(november);
	expect(result).toMatchObject({ endingBalance: 890, expenses: 110, income: 0, initialBalance: 1000 });
});

test("PREV-005: anticipated occurrence and refund never become another future expense", async () => {
	await account();
	await storage.localRecurrences.put(
		{
			amount: 100,
			createdAt: "2026-10-01",
			dayOfMonth: 15,
			id: "rent",
			interval: 1,
			isActive: true,
			materializedThrough: "2026-10-12",
			movement: "EXPENSE",
			name: "Aluguel",
			originFinancialAccountId: "checking",
			startDate: "2026-10-15",
			unit: "MONTH",
			updatedAt: "2026-10-01",
			userId: "projection-regressions",
		},
		"rent",
		owner,
	);
	await movement("advanced", "2026-10-12", 100, "EXPENSE", {
		recurrenceId: "rent",
		recurrenceOccurrenceDate: "2026-10-15",
	});
	await storage.localRecurrenceOccurrences.put(
		{ date: "2026-10-15", id: "rent:2026-10-15", recurrenceId: "rent", transactionId: "advanced" },
		"rent:2026-10-15",
		owner,
	);
	await movement("refund", "2026-10-20", 50, "REFUND");
	const before = await storage.localTransactions.getAll(owner);
	const [result] = await comparison({ ...november, endDate: "2026-10-31", startDate: "2026-10-13" });
	expect(result).toMatchObject({ endingBalance: 900, expenses: 0, income: 0, initialBalance: 900 });
	expect(await storage.localTransactions.getAll(owner)).toEqual(before);
	expect(await storage.localRecurrenceOccurrences.getAll(owner)).toHaveLength(1);
});

async function cardBook() {
	const book: CreditBook = {
		card: {
			dueDay: 28,
			id: "card",
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			statementDay: 20,
			userId: "projection-regressions",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	await storage.localCreditCards.put(
		{
			creditLimit: 10000,
			currentStatement: null,
			dueDay: 28,
			excludeFromTotals: false,
			financialAccountId: "card-account",
			id: "card",
			limit: { availableLimit: 10000, effectiveLimit: 10000, temporaryCredit: 0, usedLimit: 0 },
			paymentAccountId: "checking",
			statementDay: 20,
			workingDueDate: false,
		},
		"card",
		owner,
	);
	return book;
}

test("PREV-003: partial mixed-statement payment apportions recurring expense", async () => {
	await account();
	const book = await cardBook();
	newBookPurchase(book, {
		description: "Assinatura",
		installments: 1,
		purchaseDate: "2026-10-14",
		recurrenceId: "subscription",
		totalAmount: 100,
	});
	newBookPurchase(book, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-10-14",
		totalAmount: 100,
	});
	book.payments.push({ amount: 50, date: "2026-10-15", id: "partial" });
	await storage.localCreditBooks.put(book, "card", owner);
	await movement("partial", "2026-10-15", 50, "EXPENSE", { paymentCreditCardId: "card" });
	const [result] = await comparison({ ...november, endDate: "2026-10-31", startDate: "2026-10-13" });
	expect(result).toMatchObject({
		cardExpenses: 200,
		endingBalance: 800,
		expenses: 200,
		recurringCardExpenses: 100,
		recurringExpenses: 100,
	});
	const { getGuestDashboardFinancialContext } = await import("../dashboard-comparison");
	const context = await getGuestDashboardFinancialContext({
		...november,
		endDate: "2026-10-31",
		startDate: "2026-10-13",
	});
	expect(context.movements.find(row => row.amount === 50 && row.cardPayment)?.recurringAmount).toBe(25);
	expect(context.projectedStatements.find(row => row.balanceAmount === 150)?.recurringAmount).toBe(75);
});

test("PREV-007: mixed expenses preserve centavos without adding card subtotal twice", async () => {
	await account(4681.01);
	await storage.localAccounts.put(
		{
			balance: 0,
			createdAt: "2026-10-01",
			id: "fixed",
			name: "Renda fixa",
			type: "SAVINGS",
			updatedAt: "2026-10-01",
			userId: "projection-regressions",
		},
		"fixed",
		owner,
	);
	await movement("fixed-opening", "2026-10-01", 3284.26, "INCOME", {
		destinationFinancialAccountId: "fixed",
	});
	await movement("income", "2026-11-05", 2100, "INCOME");
	await movement("outside-card", "2026-11-05", 69.9);
	const book = await cardBook();
	newBookPurchase(book, {
		description: "Assinaturas",
		installments: 1,
		purchaseDate: "2026-11-05",
		recurrenceId: "subscriptions",
		totalAmount: 614.46,
	});
	newBookPurchase(book, {
		description: "Compras",
		installments: 1,
		purchaseDate: "2026-11-05",
		totalAmount: 1108.68,
	});
	await storage.localCreditBooks.put(book, "card", owner);
	const [result] = await comparison(november);
	expect(result.accountBalance).toBeCloseTo(4987.97, 2);
	expect(result.endingBalance).toBeCloseTo(8272.23, 2);
	expect(result.net).toBeCloseTo(306.96, 2);
	expect(result.expenses).toBeCloseTo(1793.04, 2);
	expect(result.cardExpenses).toBeCloseTo(1723.14, 2);
	expect(result.recurringExpenses).toBeCloseTo(614.46, 2);
	expect(result.expenses - result.recurringExpenses).toBeCloseTo(1178.58, 2);
});

test("PREV-006: cashback remains in reward account and points stay outside monetary wealth", async () => {
	await account();
	for (const kind of ["CASHBACK", "POINTS"] as const) {
		const id = kind.toLowerCase();
		await storage.localAccounts.put(
			{
				balance: 0,
				createdAt: "2026-10-01",
				id,
				name: kind,
				rewardsAccount: {
					financialAccountId: id,
					id: `reward-${id}`,
					initialBalance: kind === "POINTS" ? 10000 : 0,
					kind,
				},
				type: "REWARDS",
				updatedAt: "2026-10-01",
				userId: "projection-regressions",
			},
			id,
			owner,
		);
	}
	const book = await cardBook();
	newBookPurchase(book, {
		cashbackAccountId: "cashback",
		cashbackAmount: 10,
		description: "Cashback",
		installments: 1,
		purchaseDate: "2026-11-05",
		totalAmount: 100,
	});
	newBookPurchase(book, {
		cashbackAccountId: "points",
		cashbackAmount: 500,
		description: "Pontos",
		installments: 1,
		purchaseDate: "2026-11-05",
		totalAmount: 100,
	});
	await storage.localCreditBooks.put(book, "card", owner);
	const { getGuestDashboardFinancialContext } = await import("../dashboard-comparison");
	const context = await getGuestDashboardFinancialContext(november);
	expect(context.balancesAt(new Date("2026-11-30T12:00:00")).get("checking")).toBe(800);
	expect(context.balancesAt(new Date("2026-11-30T12:00:00")).get("cashback")).toBe(10);
	expect(context.periods[0]).toMatchObject({
		accountBalance: 810,
		endingBalance: 810,
		expenses: 200,
		income: 10,
	});
});

test("PREV-003: recurring card payment and projected remainder share mixed composition", async () => {
	await account();
	const book = await cardBook();
	newBookPurchase(book, {
		description: "Assinatura",
		installments: 1,
		purchaseDate: "2026-10-14",
		recurrenceId: "subscription",
		totalAmount: 100,
	});
	newBookPurchase(book, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-10-14",
		totalAmount: 100,
	});
	await storage.localCreditBooks.put(book, "card", owner);
	await storage.localRecurrences.put(
		{
			amount: 50,
			createdAt: "2026-10-01",
			creditCardId: "card",
			dayOfMonth: 15,
			endDate: "2026-10-15",
			id: "fixed-payment",
			interval: 1,
			isActive: true,
			materializedThrough: "2026-10-12",
			movement: "CARD_PAYMENT",
			name: "Pagamento fixo",
			originFinancialAccountId: "checking",
			startDate: "2026-10-15",
			unit: "MONTH",
			updatedAt: "2026-10-01",
			userId: "projection-regressions",
		},
		"fixed-payment",
		owner,
	);
	const { getGuestDashboardFinancialContext } = await import("../dashboard-comparison");
	const context = await getGuestDashboardFinancialContext({
		...november,
		endDate: "2026-10-31",
		startDate: "2026-10-13",
	});
	expect(context.periods[0]).toMatchObject({
		cardExpenses: 200,
		endingBalance: 800,
		expenses: 200,
		recurringCardExpenses: 100,
		recurringExpenses: 100,
	});
	expect(context.movements.find(row => row.amount === 50 && row.cardPayment)?.recurringAmount).toBe(25);
	expect(context.projectedStatements.find(row => row.balanceAmount === 150)?.recurringAmount).toBe(75);
	expect((await storage.localCreditBooks.getById("card", owner))?.data.payments).toEqual([]);
});

test("only hiding excludes a card from credit totals, including legacy exclusions", async () => {
	await account();
	await cardBook();
	const { dataService } = await import("../dataService");
	const stored = (await storage.localCreditCards.getById("card", owner))!.data;
	await storage.localCreditCards.put({ ...stored, excludeFromTotals: true }, stored.id, owner);
	const cardAccount: FinancialAccount = {
		balance: 0,
		createdAt: "2026-10-01",
		currency: "BRL",
		id: "card-account",
		isHidden: false,
		isPrimary: false,
		name: "Cartão legado",
		type: "CREDIT_CARD",
		updatedAt: "2026-10-01",
		userId: "projection-regressions",
	};
	await storage.localAccounts.put(cardAccount, cardAccount.id, owner);
	const visible = await dataService.dashboard.get();
	expect(visible.creditCards).toHaveLength(1);
	expect(visible.totalAvailableCredit).toBe(10000);
	await dataService.accounts.update(cardAccount.id, { isHidden: true });
	expect(await dataService.creditCards.getAll()).toHaveLength(0);
	expect(
		(await dataService.accounts.getAllIncludingHidden()).find(row => row.id === cardAccount.id)?.isHidden,
	).toBe(true);
	const hidden = await dataService.dashboard.get();
	expect(hidden.creditCards).toHaveLength(0);
	expect(hidden.totalAvailableCredit).toBe(0);
	await dataService.accounts.update(cardAccount.id, { isHidden: false });
	expect(await dataService.creditCards.getAll()).toHaveLength(1);
	expect((await dataService.dashboard.get()).totalAvailableCredit).toBe(10000);
});
