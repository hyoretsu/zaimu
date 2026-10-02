import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestResult, transactionDone } from "../idb";
import { upgradeLocalDatabase } from "./local-upgrade";

async function fixture(factory = new IDBFactory(), name = "upgrade-test") {
	const opening = factory.open(name, 10);
	opening.onupgradeneeded = () => {
		const database = opening.result;
		for (const domain of [
			"accounts",
			"creditCards",
			"creditCardStatements",
			"creditPurchases",
			"debtPeople",
			"meta",
		])
			database.createObjectStore(domain, { keyPath: "localId" });
		database
			.createObjectStore("application-upgrade", { keyPath: "id" })
			.put({ id: "state", status: "pending" });
		for (const domain of [
			"accounts",
			"categories",
			"creditBooks",
			"creditCardStatements",
			"creditCards",
			"creditPurchases",
			"creditRefundReviews",
			"debtPeople",
			"debts",
			"debtEvents",
			"loanPayments",
			"loans",
			"meta",
			"recurrenceOccurrences",
			"recurrences",
			"recurringPayments",
			"salaries",
			"stores",
			"subscriptions",
			"transactions",
		])
			database
				.createObjectStore(`scoped-${domain}`, { keyPath: "scopedId" })
				.createIndex("ownerKey", "ownerKey");
	};
	return requestResult(opening);
}

test("upgrade aborts every conversion on a late failure and retries without losing clocks", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction(["accounts", "scoped-creditPurchases"], "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("accounts").put({
			data: { id: "a", userId: "guest_owner", yieldRate: 1 },
			deleted: true,
			localId: "a",
			modifiedAt: 123,
			syncedAt: 110,
		});
		tx.objectStore("scoped-creditPurchases").put({
			data: { id: "orphan", statementId: "missing" },
			localId: "orphan",
			modifiedAt: 42,
			ownerKey: "guest:guest_owner",
			scopedId: "guest:guest_owner\u0000orphan",
		});
		await done;
		await expect(upgradeLocalDatabase(database)).rejects.toThrow("Compra legada");
		let check = database.transaction(["scoped-accounts", "application-upgrade"], "readonly");
		expect(await requestResult(check.objectStore("scoped-accounts").count())).toBe(0);
		expect((await requestResult(check.objectStore("application-upgrade").get("state"))).status).toBe(
			"pending",
		);
		const repair = database.transaction("scoped-creditPurchases", "readwrite");
		const repaired = transactionDone(repair);
		repair.objectStore("scoped-creditPurchases").clear();
		await repaired;
		await upgradeLocalDatabase(database);
		await upgradeLocalDatabase(database);
		check = database.transaction(["scoped-accounts", "application-upgrade"], "readonly");
		expect(
			await requestResult(check.objectStore("scoped-accounts").get("guest:guest_owner\u0000a")),
		).toMatchObject({ data: { yieldFixedRate: 1 }, deleted: true, modifiedAt: 123, syncedAt: 110 });
		expect(
			(await requestResult(check.objectStore("application-upgrade").get("archive:accounts:a"))).original.data
				.yieldRate,
		).toBe(1);
	} finally {
		database.close();
	}
});

test("unattributed legacy records are archived without blocking initialization or concurrent tabs", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction(["accounts", "debtPeople"], "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("accounts").put({
			data: { id: "unowned", name: "Historic" },
			localId: "unowned",
			modifiedAt: 7,
		});
		tx.objectStore("debtPeople").put({
			data: { id: "person", name: "Lucas Dantas" },
			localId: "person",
			modifiedAt: 9,
			syncedAt: 9,
		});
		await done;
		await Promise.all([upgradeLocalDatabase(database), upgradeLocalDatabase(database)]);
		await upgradeLocalDatabase(database);
		const check = database.transaction(
			["scoped-accounts", "scoped-debtPeople", "application-upgrade"],
			"readonly",
		);
		expect(await requestResult(check.objectStore("scoped-accounts").count())).toBe(0);
		expect(await requestResult(check.objectStore("scoped-debtPeople").count())).toBe(0);
		expect(
			await requestResult(check.objectStore("application-upgrade").get("archive:accounts:unowned")),
		).toMatchObject({ original: { modifiedAt: 7 }, preservedReason: "unresolved-owner" });
		expect(
			await requestResult(check.objectStore("application-upgrade").get("archive:debtPeople:person")),
		).toMatchObject({
			original: { data: { name: "Lucas Dantas" }, modifiedAt: 9, syncedAt: 9 },
			preservedReason: "unresolved-owner",
		});
		expect(await requestResult(check.objectStore("application-upgrade").get("state"))).toMatchObject({
			status: "complete",
		});
	} finally {
		database.close();
	}
});

test("tags and reference yields convert while preserving clocks, tombstones and exact archive", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction(
			["scoped-accounts", "scoped-transactions", "scoped-creditBooks"],
			"readwrite",
		);
		const done = transactionDone(tx);
		const row = (id: string, data: unknown) => ({
			data,
			deleted: true,
			localId: id,
			modifiedAt: 42,
			ownerKey: "user:a",
			scopedId: `user:a\u0000${id}`,
			syncedAt: 40,
		});
		tx.objectStore("scoped-accounts").put(
			row("account", {
				id: "account",
				yieldRateHistories: [
					{ effectiveDate: "2026-01-01", yieldReferencePercentage: 100, yieldReferenceRate: 13 },
				],
				yieldReferencePercentage: 110,
				yieldReferenceRate: 12,
			}),
		);
		tx.objectStore("scoped-transactions").put(
			row("transaction", {
				categoryColor: "red",
				categoryId: "old",
				categoryName: "Old",
				id: "transaction",
				tagIds: ["new"],
			}),
		);
		tx.objectStore("scoped-creditBooks").put(
			row("card", {
				charges: [],
				purchases: [{ categoryId: "old", id: "purchase", tagIds: ["old", "new"] }],
			}),
		);
		await done;
		await upgradeLocalDatabase(database);
		const reading = database.transaction(
			["scoped-accounts", "scoped-transactions", "scoped-creditBooks", "application-upgrade"],
			"readonly",
		);
		const account = await requestResult(reading.objectStore("scoped-accounts").get("user:a\u0000account"));
		expect(account.data.yieldReferenceType).toBe("CDI");
		expect(account.data).not.toHaveProperty("yieldReferenceRate");
		expect(account.data.yieldRateHistories[0].yieldReferenceType).toBe("CDI");
		expect(account.data.yieldRateHistories[0]).not.toHaveProperty("yieldReferenceRate");
		const transaction = await requestResult(
			reading.objectStore("scoped-transactions").get("user:a\u0000transaction"),
		);
		expect(transaction).toMatchObject({
			data: { tagIds: ["new", "old"] },
			deleted: true,
			modifiedAt: 42,
			syncedAt: 40,
		});
		expect(transaction.data).not.toHaveProperty("categoryId");
		expect(
			(await requestResult(reading.objectStore("scoped-creditBooks").get("user:a\u0000card"))).data
				.purchases[0].tagIds,
		).toEqual(["old", "new"]);
		expect(
			(
				await requestResult(
					reading
						.objectStore("application-upgrade")
						.get("archive:scoped-transactions:user:a\u0000transaction"),
				)
			).original.data.categoryId,
		).toBe("old");
	} finally {
		database.close();
	}
});

test("upgrade resolves statement links, scoped owners and previously reviewed roots", async () => {
	const factory = new IDBFactory();
	const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: factory });
	const database = await fixture(factory, "zaimu-local");
	try {
		const tx = database.transaction(Array.from(database.objectStoreNames), "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("scoped-accounts").put({
			data: { id: "account" },
			localId: "account",
			modifiedAt: 3,
			ownerKey: "user:owner",
			scopedId: "user:owner\u0000account",
		});
		tx.objectStore("creditCards").put({
			data: { financialAccountId: "account", id: "card" },
			deleted: true,
			localId: "card",
		});
		tx.objectStore("creditCardStatements").put({
			data: { creditCardId: "card", id: "statement" },
			deleted: true,
			localId: "statement",
		});
		tx.objectStore("creditPurchases").put({
			data: { id: "purchase", statementId: "statement" },
			deleted: true,
			localId: "purchase",
			modifiedAt: 8,
			syncedAt: 5,
		});
		tx.objectStore("accounts").put({ data: { id: "root" }, localId: "root" });
		tx.objectStore("creditCardStatements").put({
			data: { financialAccountId: "root", id: "child" },
			deleted: true,
			localId: "child",
		});
		await done;
		const review = database.transaction("application-upgrade", "readwrite");
		const reviewed = transactionDone(review);
		review.objectStore("application-upgrade").put({ id: "owner:accounts:root", ownerKey: "user:chosen" });
		await reviewed;
		await upgradeLocalDatabase(database);
		const reading = database.transaction(
			["scoped-meta", "scoped-creditCardStatements", "application-upgrade"],
			"readonly",
		);
		expect(
			await requestResult(reading.objectStore("scoped-meta").get("user:owner\u0000credit-source-purchase")),
		).toMatchObject({
			deleted: true,
			modifiedAt: 8,
			ownerKey: "user:owner",
			syncedAt: 5,
		});
		expect(
			await requestResult(reading.objectStore("scoped-creditCardStatements").get("user:chosen\u0000child")),
		).toMatchObject({ ownerKey: "user:chosen" });
		expect(
			(
				await requestResult(
					reading.objectStore("application-upgrade").get("archive:creditPurchases:purchase"),
				)
			).original.data.statementId,
		).toBe("statement");
	} finally {
		database.close();
		if (original) Object.defineProperty(globalThis, "indexedDB", original);
		else Reflect.deleteProperty(globalThis, "indexedDB");
	}
});

test("ambiguous legacy references are archived and unrelated domains do not establish ownership", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction(
			["accounts", "creditCards", "scoped-accounts", "scoped-creditCards"],
			"readwrite",
		);
		const done = transactionDone(tx);
		for (const ownerKey of ["user:a", "user:b"])
			tx.objectStore("scoped-accounts").put({
				data: { id: "shared" },
				localId: "shared",
				ownerKey,
				scopedId: `${ownerKey}\u0000shared`,
			});
		tx.objectStore("scoped-creditCards").put({
			data: { id: "unrelated" },
			deleted: true,
			localId: "unrelated",
			ownerKey: "user:a",
			scopedId: "user:a\u0000unrelated",
		});
		tx.objectStore("accounts").put({
			data: { financialAccountId: "shared", id: "conflict" },
			localId: "conflict",
		});
		tx.objectStore("accounts").put({
			data: { financialAccountId: "unrelated", id: "orphan" },
			localId: "orphan",
		});
		tx.objectStore("creditCards").put({
			data: { financialAccountId: "conflict", id: "dependent", userId: "a" },
			localId: "dependent",
		});
		await done;
		await upgradeLocalDatabase(database);
		const check = database.transaction(
			["application-upgrade", "scoped-accounts", "scoped-creditCards"],
			"readonly",
		);
		expect(await requestResult(check.objectStore("scoped-accounts").count())).toBe(2);
		expect(await requestResult(check.objectStore("scoped-creditCards").count())).toBe(1);
		for (const id of ["conflict", "orphan"])
			expect(
				await requestResult(check.objectStore("application-upgrade").get(`archive:accounts:${id}`)),
			).toMatchObject({ preservedReason: "unresolved-owner" });
		expect(
			await requestResult(check.objectStore("application-upgrade").get("archive:creditCards:dependent")),
		).toMatchObject({ preservedReason: "unresolved-reference" });
	} finally {
		database.close();
	}
});

test("global sync cursor is archived without asking for an owner or copying it into account sync", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction("meta", "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("meta").put({ data: 123, localId: "lastSyncAt", modifiedAt: 4 });
		await done;
		await upgradeLocalDatabase(database);
		const reading = database.transaction(["application-upgrade", "scoped-meta", "meta"], "readonly");
		expect(
			(await requestResult(reading.objectStore("application-upgrade").get("archive:meta:lastSyncAt")))
				.original,
		).toEqual({ data: 123, localId: "lastSyncAt", modifiedAt: 4 });
		expect(await requestResult(reading.objectStore("scoped-meta").count())).toBe(0);
		expect(await requestResult(reading.objectStore("meta").count())).toBe(0);
	} finally {
		database.close();
	}
});

test("people inherit ownership from linked financial records and scoped debt events", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction(["debtPeople", "scoped-transactions", "scoped-debtEvents"], "readwrite");
		const done = transactionDone(tx);
		for (const id of ["split-person", "event-person"])
			tx.objectStore("debtPeople").put({
				data: { id, name: "Lucas Dantas" },
				localId: id,
				modifiedAt: 9,
				syncedAt: 7,
			});
		tx.objectStore("scoped-transactions").put({
			data: { debtSplit: { participants: [{ debtPersonId: "split-person" }] }, id: "transaction" },
			localId: "transaction",
			modifiedAt: 1,
			ownerKey: "user:owner",
			scopedId: "user:owner\u0000transaction",
		});
		tx.objectStore("scoped-debtEvents").put({
			data: { debtPersonId: "event-person", id: "event" },
			localId: "event",
			modifiedAt: 1,
			ownerKey: "user:owner",
			scopedId: "user:owner\u0000event",
		});
		await done;
		await upgradeLocalDatabase(database);
		const reading = database.transaction("scoped-debtPeople", "readonly");
		for (const id of ["split-person", "event-person"])
			expect(
				await requestResult(reading.objectStore("scoped-debtPeople").get(`user:owner\u0000${id}`)),
			).toMatchObject({ data: { name: "Lucas Dantas" }, modifiedAt: 9, ownerKey: "user:owner", syncedAt: 7 });
	} finally {
		database.close();
	}
});

test("person references from multiple owners are preserved outside active stores", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction(["debtPeople", "scoped-debtEvents"], "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("debtPeople").put({ data: { id: "person", name: "Lucas Dantas" }, localId: "person" });
		for (const ownerKey of ["user:a", "user:b"])
			tx.objectStore("scoped-debtEvents").put({
				data: { debtPersonId: "person", id: "event" },
				localId: "event",
				ownerKey,
				scopedId: `${ownerKey}\u0000event`,
			});
		await done;
		await upgradeLocalDatabase(database);
		expect(
			await requestResult(
				database
					.transaction("application-upgrade", "readonly")
					.objectStore("application-upgrade")
					.get("archive:debtPeople:person"),
			),
		).toMatchObject({ preservedReason: "unresolved-owner" });
		expect(
			await requestResult(
				database.transaction("scoped-debtPeople", "readonly").objectStore("scoped-debtPeople").count(),
			),
		).toBe(0);
	} finally {
		database.close();
	}
});
