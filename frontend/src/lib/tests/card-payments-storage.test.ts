import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

// An isolated native-compatible IndexedDB implementation, never the user's browser database.
test("upgrades v5 guest/cache payments and replays the guest service after edits and deletion", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const owner = "guest:guest_ledger_test" as const;
	const record = (data: Record<string, unknown>, ownerKey = owner as string) => ({
		data,
		localId: data.id,
		modifiedAt: 123,
		ownerKey,
		scopedId: `${ownerKey}\u0000${data.id}`,
		syncedAt: 110,
	});
	const invoice = (id: string, month: string, amount: number) => ({
		balanceAmount: amount,
		creditCardId: "card",
		dueDate: `2024-${month}-25`,
		id,
		isPaid: false,
		paidAmount: 0,
		statementDate: `2024-${month}-15`,
		totalAmount: amount,
	});
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("zaimu-local", 5);
		request.onupgradeneeded = () => {
			for (const domain of [
				"transactions",
				"creditCardStatements",
				"creditCards",
				"accounts",
				"creditPurchases",
			]) {
				const store = request.result.createObjectStore(`scoped-${domain}`, { keyPath: "scopedId" });
				for (const index of ["ownerKey", "syncedAt", "modifiedAt", "deleted"])
					store.createIndex(index, index);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	const legacy = record({
		amount: 120,
		createdAt: "2024-08-26T14:30:00Z",
		creditCardStatementId: "august",
		date: "2024-08-26",
		description: "Pagamento",
		id: "payment",
		originFinancialAccountId: "payer",
		time: "14:30",
		type: "EXPENSE",
	});
	const tx = db.transaction(
		["scoped-transactions", "scoped-creditCardStatements", "scoped-creditCards", "scoped-accounts"],
		"readwrite",
	);
	const finished = new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	tx.objectStore("scoped-transactions").put(legacy);
	tx.objectStore("scoped-transactions").put(
		record({ amount: 4, creditCardStatementId: "missing", date: "2024-01-01", id: "orphan" }),
	);
	tx.objectStore("scoped-transactions").put(record({ ...legacy.data, id: "cached" }, "user:cached"));
	tx.objectStore("scoped-creditCardStatements").put(record(invoice("august", "08", 100)));
	tx.objectStore("scoped-creditCardStatements").put(record(invoice("september", "09", 80)));
	tx.objectStore("scoped-creditCardStatements").put(
		record({ ...invoice("august", "08", 0), creditCardId: "cached-card" }, "user:cached"),
	);
	tx.objectStore("scoped-creditCards").put(
		record({
			creditLimit: 1000,
			dueDay: 25,
			financialAccountId: "card-account",
			id: "card",
			statementDay: 15,
		}),
	);
	tx.objectStore("scoped-accounts").put(
		record({ id: "payer", initialBalance: 1000, name: "Pagadora", type: "CHECKING" }),
	);
	tx.objectStore("scoped-accounts").put(
		record({ id: "card-account", name: "Cartão teste", type: "CREDIT_CARD" }),
	);
	await finished;
	db.close();
	const storage = await import("../localStorage");
	const { useAuthStore } = await import("@/stores/auth");
	useAuthStore.setState({
		guestId: "guest_ledger_test",
		isAuthenticated: false,
		isGuestMode: true,
		isInitialized: true,
	});
	expect((await storage.initLocalDb()).version).toBe(6);
	const migrated = (await storage.localTransactions.getById("payment", owner))!;
	expect(migrated).toMatchObject({
		data: { amount: 120, paymentCreditCardId: "card", time: "14:30" },
		modifiedAt: 123,
		syncedAt: 110,
	});
	expect("creditCardStatementId" in migrated.data).toBe(false);
	expect((await storage.localTransactions.getById("cached", "user:cached"))?.data.paymentCreditCardId).toBe(
		"cached-card",
	);
	expect((await storage.localTransactions.getById("orphan", owner))?.data).toHaveProperty(
		"creditCardStatementId",
		"missing",
	);
	const { dataService } = await import("../dataService");
	const rows = await dataService.creditCards.getStatements("card");
	expect(rows.find(row => row.id === "august")).toMatchObject({
		carriedOutAmount: 100,
		isPaid: false,
		status: "CARRIED",
	});
	expect(rows.find(row => row.id === "september")).toMatchObject({
		carriedInAmount: 100,
		carriedOutAmount: 60,
		paidAmount: 120,
	});
	expect(rows.reduce((sum, row) => sum + row.balanceAmount, 0)).toBe(60);
	expect((await dataService.creditCards.getStatement("card", "august")).payments).toHaveLength(0);
	expect((await dataService.creditCards.getStatement("card", "september")).payments[0]?.id).toBe("payment");
	expect((await dataService.creditCards.getAll())[0]?.limit.usedLimit).toBe(60);
	await storage.localTransactions.put({ ...migrated.data, amount: 200 }, "payment", owner);
	const edited = await dataService.creditCards.getStatements("card");
	expect(edited.find(row => row.id === "august")?.status).toBe("CARRIED");
	expect(edited.find(row => row.id === "september")?.isPaid).toBe(true);
	expect(edited.reduce((sum, row) => sum + row.balanceAmount, 0)).toBe(-20);
	await storage.localTransactions.delete("payment", owner);
	expect(
		(await dataService.creditCards.getStatements("card")).reduce((sum, row) => sum + row.balanceAmount, 0),
	).toBe(180);
});
