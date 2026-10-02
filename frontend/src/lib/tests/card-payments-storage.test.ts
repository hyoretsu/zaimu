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
		[
			"scoped-transactions",
			"scoped-creditCardStatements",
			"scoped-creditCards",
			"scoped-accounts",
			"scoped-creditPurchases",
		],
		"readwrite",
	);
	const finished = new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	for (const [id, statementId, purchaseDate, totalAmount] of [
		["p1", "august", "2024-08-10", 100],
		["p2", "september", "2024-09-10", 80],
	] as const) {
		tx.objectStore("scoped-creditPurchases").put(
			record({
				currentInstallment: 1,
				description: "Compra",
				hasImportedAmount: false,
				id,
				installmentAmount: totalAmount,
				installments: 1,
				isRefund: false,
				purchaseDate,
				statementId,
				tagIds: [],
				totalAmount,
			}),
		);
	}
	tx.objectStore("scoped-creditPurchases").put(
		record({
			currentInstallment: 1,
			description: "Crédito importado",
			id: "unlinked-refund",
			installmentAmount: -10,
			installments: 1,
			isRefund: true,
			purchaseDate: "2024-09-10",
			statementId: "september",
			tagIds: [],
			totalAmount: -10,
		}),
	);
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
	expect((await storage.initLocalDb()).version).toBeGreaterThanOrEqual(7);
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
	const beforeRead = (await storage.localCreditBooks.getById("card", owner))!;
	await storage.readLocalCreditBook("card", owner);
	await storage.readLocalCreditBook("card", owner);
	expect((await storage.localCreditBooks.getById("card", owner))?.modifiedAt).toBe(beforeRead.modifiedAt);
	expect((await dataService.creditCards.getRefundReviews("card")).map(review => review.id)).toEqual([
		"unlinked-refund",
	]);
	await dataService.creditCards.approveRefundReview("card", "unlinked-refund", { purchaseId: "p2" });
	expect(await dataService.creditCards.getRefundReviews("card")).toHaveLength(0);
	const first = (await dataService.creditCards.getBook("card")).refunds.find(
		refund => refund.id === "unlinked-refund",
	)!;
	const second = await dataService.creditCards.refundPurchase("card", "p2", {
		amount: 20,
		date: "2024-09-11",
	});
	await dataService.creditCards.updateRefund("card", "p2", second.id, { amount: 30, date: "2024-09-12" });
	expect((await dataService.creditCards.getBook("card")).refunds.map(refund => refund.id)).toEqual([
		first.id,
		second.id,
	]);
	const beforeFailure = (await storage.localCreditBooks.getById("card", owner))!;
	await expect(
		dataService.creditCards.refundPurchase("card", "p2", { amount: 50, date: "2024-09-13" }),
	).rejects.toThrow();
	expect((await storage.localCreditBooks.getById("card", owner))!).toEqual(beforeFailure);
	expect(
		(await dataService.transactions.getAll({ type: "REFUND" })).map(transaction => transaction.type),
	).toEqual(["REFUND", "REFUND"]);
	expect(
		(await dataService.transactions.getAll({ type: "EXPENSE" })).find(transaction => transaction.id === "p2")
			?.amount,
	).toBe(40);
	expect(await storage.localCreditBooks.getAll("user:outsider")).toHaveLength(0);
	const sent = await storage.localCreditBooks.getAll(owner);
	await storage.mutateLocalCreditBook(
		"card",
		book => {
			book.purchases.find(p => p.id === "p2")!.description = "Editada enquanto sincronizava";
		},
		owner,
	);
	const concurrent = (await storage.localCreditBooks.getById("card", owner))!;
	await storage.acknowledgeCreditBookSync(
		sent,
		sent.map(row => row.data),
		owner,
	);
	expect(await storage.localCreditBooks.getById("card", owner)).toEqual(concurrent);
	const latest = await storage.localCreditBooks.getAll(owner);
	await storage.acknowledgeCreditBookSync(
		latest,
		latest.map(row => row.data),
		owner,
	);
	expect((await storage.localCreditBooks.getById("card", owner))?.syncedAt).toBe(
		(await storage.localCreditBooks.getById("card", owner))?.modifiedAt,
	);

	const laterOwner = "guest:later_owner" as const;
	await storage.localCreditCards.put(
		{
			creditLimit: 1000,
			dueDay: 25,
			financialAccountId: "later-account",
			id: "later-card",
			statementDay: 15,
		} as import("../api").CreditCard,
		"later-card",
		laterOwner,
	);
	const { newBookPurchase } = await import("@zaimu/finance/credit-book");
	await storage.mutateLocalCreditBook(
		"later-card",
		book =>
			newBookPurchase(book, {
				description: "Criada após migração",
				installments: 1,
				purchaseDate: "2024-08-10",
				totalAmount: 50,
			}),
		laterOwner,
	);
	const laterBook = (await storage.localCreditBooks.getById("later-card", laterOwner))!;
	const { migrateCreditBooks } = await import("../migrate-credit-books");
	await migrateCreditBooks(await storage.initLocalDb());
	expect(await storage.localCreditBooks.getById("later-card", laterOwner)).toEqual(laterBook);

	const futureId = await storage.mutateLocalCreditBook(
		"later-card",
		book =>
			newBookPurchase(book, {
				description: "Parcelas devidas",
				installments: 2,
				purchaseDate: "2099-01-10",
				totalAmount: 100,
			}).id,
		laterOwner,
	);
	expect(
		(await storage.readLocalCreditBook("later-card", laterOwner)).installments.filter(
			i => i.purchaseId === futureId,
		),
	).toHaveLength(0);
	expect(await storage.materializeLocalCreditBooks(laterOwner, "2099-01-31")).toBe(1);
	const materialized = (await storage.localCreditBooks.getById("later-card", laterOwner))!;
	expect(materialized.data.installments.filter(i => i.purchaseId === futureId)).toHaveLength(1);
	expect(await storage.materializeLocalCreditBooks(laterOwner, "2099-01-31")).toBe(0);
	expect(await storage.localCreditBooks.getById("later-card", laterOwner)).toEqual(materialized);
});
