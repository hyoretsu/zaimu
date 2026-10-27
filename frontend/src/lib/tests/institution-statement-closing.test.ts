import { afterEach, expect, setSystemTime, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import type { FinancialAccount } from "../api";

afterEach(() => setSystemTime());

test("visitor closing-day institution policy reaches purchases and persisted books", async () => {
	setSystemTime(new Date("2026-10-11T12:00:00Z"));
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const persisted = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => persisted.get(key) ?? null,
			removeItem: (key: string) => {
				persisted.delete(key);
			},
			setItem: (key: string, value: string) => {
				persisted.set(key, value);
			},
		},
	});
	const { useAuthStore } = await import("@/stores/auth");
	useAuthStore.setState({
		guestId: "guest_closing_policy",
		isAuthenticated: false,
		isGuestMode: true,
		user: null,
	});
	const storage = await import("../localStorage");
	const { dataService } = await import("../dataService");
	const owner = "guest:guest_closing_policy" as const;
	const institution = { currency: "BRL", id: "bank", name: "Banco" };
	const account: FinancialAccount = {
		balance: null,
		createdAt: "2026-01-01",
		currency: "BRL",
		id: "account",
		institution,
		institutionId: "bank",
		name: "Cartão",
		type: "CREDIT_CARD",
		updatedAt: "2026-01-01",
		userId: "guest_closing_policy",
	};
	await storage.localAccounts.put(account, account.id, owner);
	await storage.localAccounts.put({ ...account, id: "sibling", type: "CHECKING" }, "sibling", owner);
	await storage.localAccounts.put(
		{
			...account,
			id: "other",
			institution: { ...institution, id: "other-bank" },
			institutionId: "other-bank",
		},
		"other",
		owner,
	);
	const card = await dataService.creditCards.createFromAccount(account, {
		creditLimit: 1000,
		dueDay: 28,
		statementDay: 20,
		workingDueDate: false,
	});
	const input = {
		currency: "BRL",
		description: "Compra no fechamento",
		installments: 1,
		purchaseDate: "2026-09-20",
		time: null,
		totalAmount: 100,
	};
	await dataService.creditCards.addPurchase(card.id, input);
	let book = await dataService.creditCards.getBook(card.id);
	expect(book.card.statementClosingInclusive).toBe(false);
	expect(
		book.statements.find(statement => statement.id === book.installments[0].statementId)?.statementDate,
	).toBe("2026-10-20");
	const original = book.installments[0];
	await dataService.financialInstitutions.update("bank", { creditStatementClosingInclusive: true });
	book = await dataService.creditCards.getBook(card.id);
	expect(book.installments.find(item => item.id === original.id)?.statementId).toBe(original.statementId);
	expect(
		(await storage.localAccounts.getById("sibling", owner))?.data.institution
			?.creditStatementClosingInclusive,
	).toBe(true);
	expect(
		(await storage.localAccounts.getById("other", owner))?.data.institution
			?.creditStatementClosingInclusive,
	).toBeUndefined();
	const added = await dataService.creditCards.addPurchase(card.id, input);
	book = await dataService.creditCards.getBook(card.id);
	expect(book.card.statementClosingInclusive).toBe(true);
	expect(
		book.statements.find(
			statement =>
				statement.id ===
				book.installments.find(item => item.purchaseId === added[0].purchaseId)?.statementId,
		)?.statementDate,
	).toBe("2026-09-20");
	await dataService.creditCards.updatePurchase(card.id, original.purchaseId, {
		...input,
		purchaseDate: "2026-09-19",
		tagIds: [],
	});
	await dataService.creditCards.updatePurchase(card.id, original.purchaseId, { ...input, tagIds: [] });
	book = await dataService.creditCards.getBook(card.id);
	expect(
		book.statements.find(
			statement =>
				statement.id ===
				book.installments.find(item => item.purchaseId === original.purchaseId)?.statementId,
		)?.statementDate,
	).toBe("2026-09-20");
	await dataService.financialInstitutions.update("bank", { creditStatementClosingInclusive: false });
	expect((await dataService.creditCards.getBook(card.id)).card.statementClosingInclusive).toBe(false);
});
