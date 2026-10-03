import { expect, test } from "bun:test";
import { type CreditBook, newBookPurchase } from "@zaimu/finance/credit-book";
import { IDBFactory } from "fake-indexeddb";

test("visitor payment validates balance and date, serializes attempts and isolates owners", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const { useAuthStore } = await import("@/stores/auth");
	useAuthStore.setState({ guestId: "suggestions", isAuthenticated: false, isGuestMode: true, user: null });
	const storage = await import("../localStorage");
	const owner = "guest:suggestions" as const;
	const account = {
		balance: 0,
		createdAt: "2026-01-01",
		id: "payer",
		name: "Conta",
		type: "CHECKING" as const,
		updatedAt: "2026-01-01",
		userId: "suggestions",
	};
	await storage.localAccounts.put(account, "payer", owner);
	await storage.setLocalPrimaryAccount("payer");
	expect((await storage.localAccounts.getById("payer", owner))?.data.isPrimary).toBe(true);
	await storage.localAccounts.put({ ...account, id: "other-payer" }, "other-payer", owner);
	await storage.setLocalPrimaryAccount("other-payer");
	expect(
		(await storage.localAccounts.getAll(owner)).filter(row => row.data.isPrimary).map(row => row.localId),
	).toEqual(["other-payer"]);
	await storage.setLocalPrimaryAccount("payer");
	await expect(storage.setLocalPrimaryAccount("missing")).rejects.toThrow();
	const card = {
		accountName: "Cartão",
		creditLimit: 1000,
		currentStatement: null,
		dueDay: 28,
		excludeFromTotals: false,
		financialAccountId: "card-account",
		id: "card",
		limit: { availableLimit: 1000, effectiveLimit: 1000, temporaryCredit: 0, usedLimit: 0 },
		statementDay: 20,
		workingDueDate: false,
	};
	await storage.localCreditCards.put(card, "card", owner);
	const book: CreditBook = {
		card: {
			...card,
			ignoreStatementsBefore: null,
			institutionId: null,
			refundPolicy: null,
			userId: "suggestions",
		},
		charges: [],
		installments: [],
		payments: [],
		purchases: [],
		refunds: [],
		statements: [],
	};
	newBookPurchase(book, {
		description: "Compra",
		installments: 1,
		purchaseDate: "2026-08-10",
		totalAmount: 100,
	});
	await storage.localCreditBooks.put(book, "card", owner);
	const { pendingStatementPayments } = await import("@zaimu/finance/payment-suggestions");
	const suggestion = pendingStatementPayments(book)[0];
	const input = {
		amount: 100,
		attemptId: crypto.randomUUID(),
		date: "2026-08-25",
		financialAccountId: "payer",
		statementId: suggestion.statementId,
	};
	await expect(storage.confirmLocalSuggestedPayment("card", input)).rejects.toThrow();
	await storage.localTransactions.put(
		{
			amount: 200,
			createdAt: "2026-08-01",
			date: "2026-08-01",
			description: "Receita",
			destinationFinancialAccountId: "payer",
			id: "income",
			type: "INCOME",
		},
		"income",
		owner,
	);
	await expect(
		storage.confirmLocalSuggestedPayment("card", { ...input, date: "2026-08-19" }),
	).rejects.toThrow();
	const [first, repeated] = await Promise.all([
		storage.confirmLocalSuggestedPayment("card", input),
		storage.confirmLocalSuggestedPayment("card", input),
	]);
	expect(first.transaction.id).toBe(repeated.transaction.id);
	expect(
		(await storage.localTransactions.getAll(owner)).filter(row => row.data.paymentCreditCardId),
	).toHaveLength(1);
	await expect(
		storage.confirmLocalSuggestedPayment("card", { ...input, date: "2026-08-26" }),
	).rejects.toThrow("Tentativa");
	await expect(
		storage.confirmLocalSuggestedPayment("card", { ...input, attemptId: crypto.randomUUID() }),
	).rejects.toThrow();
	expect(await storage.localTransactions.getAll("guest:other")).toEqual([]);
});
