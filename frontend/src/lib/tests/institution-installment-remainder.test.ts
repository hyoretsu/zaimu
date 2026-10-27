import { afterEach, expect, setSystemTime, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import type { FinancialAccount } from "../api";

afterEach(() => setSystemTime());

test("visitor institution policy reaches new purchases, reloads and explicit recalculations", async () => {
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
		guestId: "guest_installment_policy",
		isAuthenticated: false,
		isGuestMode: true,
		user: null,
	});
	const storage = await import("../localStorage");
	const { dataService } = await import("../dataService");
	const owner = "guest:guest_installment_policy" as const;
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
		userId: "guest_installment_policy",
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
		description: "AliExpress",
		installments: 12,
		purchaseDate: "2026-08-10",
		time: null,
		totalAmount: 218.33,
	};
	await dataService.creditCards.addPurchase(card.id, input);
	const original = (await dataService.creditCards.getBook(card.id)).purchases[0];
	const distributed = [...Array<number>(5).fill(1820), ...Array<number>(7).fill(1819)];
	expect(original.installmentAmountsCents).toEqual(distributed);
	const updated = await dataService.financialInstitutions.update("bank", {
		creditInstallmentRemainderOnFirst: true,
	});
	expect(updated.creditInstallmentRemainderOnFirst).toBe(true);
	expect(
		(await storage.localAccounts.getById("sibling", owner))?.data.institution
			?.creditInstallmentRemainderOnFirst,
	).toBe(true);
	expect(
		(await storage.localAccounts.getById("other", owner))?.data.institution
			?.creditInstallmentRemainderOnFirst,
	).toBeUndefined();
	let book = await dataService.creditCards.getBook(card.id);
	expect(book.card.installmentRemainderOnFirst).toBe(true);
	expect(book.purchases[0].installmentAmountsCents).toEqual(distributed);
	await dataService.creditCards.addPurchase(card.id, input);
	book = await dataService.creditCards.getBook(card.id);
	const concentrated = [1824, ...Array<number>(11).fill(1819)];
	expect(book.purchases[1].installmentAmountsCents).toEqual(concentrated);
	await dataService.creditCards.updatePurchase(card.id, original.id, { ...input, tagIds: [] });
	book = await dataService.creditCards.getBook(card.id);
	expect(book.purchases[0].installmentAmountsCents).toEqual(concentrated);
	expect(
		book.installments.filter(item => item.purchaseId === original.id).map(item => item.amountCents),
	).toEqual([1824, 1819, 1819]);
	await dataService.financialInstitutions.update("bank", { creditInstallmentRemainderOnFirst: false });
	expect((await dataService.creditCards.getBook(card.id)).card.installmentRemainderOnFirst).toBe(false);
	await dataService.creditCards.addPurchase(card.id, input);
	book = await dataService.creditCards.getBook(card.id);
	expect(book.purchases[2].installmentAmountsCents).toEqual(distributed);
	expect(book.purchases[1].installmentAmountsCents).toEqual(concentrated);
});
