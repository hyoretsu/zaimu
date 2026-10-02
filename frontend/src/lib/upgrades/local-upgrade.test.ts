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
