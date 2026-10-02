import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestResult, transactionDone } from "../idb";
import { reviewLocalOwnership, upgradeLocalDatabase } from "./local-upgrade";

async function fixture() {
	const factory = new IDBFactory();
	const opening = factory.open("upgrade-test", 10);
	opening.onupgradeneeded = () => {
		const database = opening.result;
		database.createObjectStore("accounts", { keyPath: "localId" });
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

test("ambiguous ownership blocks upgrade until explicit review; concurrent tabs convert once", async () => {
	const database = await fixture();
	try {
		const tx = database.transaction("accounts", "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("accounts").put({
			data: { id: "unowned", name: "Historic" },
			localId: "unowned",
			modifiedAt: 7,
		});
		await done;
		await expect(upgradeLocalDatabase(database)).rejects.toThrow("Proprietário ambíguo");
		await reviewLocalOwnership(database, [
			{ domain: "accounts", localId: "unowned", ownerKey: "user:chosen" },
		]);
		await Promise.all([upgradeLocalDatabase(database), upgradeLocalDatabase(database)]);
		const check = database.transaction("scoped-accounts", "readonly");
		expect(await requestResult(check.objectStore("scoped-accounts").count())).toBe(1);
		expect((await requestResult(check.objectStore("scoped-accounts").getAll()))[0]).toMatchObject({
			modifiedAt: 7,
			ownerKey: "user:chosen",
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
