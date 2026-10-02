import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestResult, transactionDone } from "../idb";

test("verified conversion deletes source stores in later schema and never imports originals twice", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const opening = indexedDB.open("zaimu-local", 12);
	opening.onupgradeneeded = () => {
		for (const name of ["accounts", "debtPeople", "meta"])
			opening.result.createObjectStore(name, { keyPath: "localId" });
		opening.result.createObjectStore("application-upgrade", { keyPath: "id" });
	};
	const old = await requestResult(opening);
	const tx = old.transaction(["accounts", "debtPeople", "meta", "application-upgrade"], "readwrite");
	const done = transactionDone(tx);
	tx.objectStore("accounts").put({
		data: { id: "a", userId: "user_a", yieldRate: 2 },
		localId: "a",
		modifiedAt: 100,
		syncedAt: 90,
	});
	tx.objectStore("debtPeople").put({
		data: { events: [], id: "person", name: "Lucas Dantas" },
		localId: "person",
		modifiedAt: 90,
		syncedAt: 90,
	});
	tx.objectStore("meta").put({ data: 90, localId: "lastSyncAt" });
	tx.objectStore("application-upgrade").put({ id: "state", status: "complete", version: 12 });
	await done;
	old.close();
	const { initLocalDb, replaceRemoteSnapshot } = await import("../localStorage");
	const upgraded = await initLocalDb();
	expect(upgraded.version).toBe(14);
	expect(upgraded.objectStoreNames.contains("accounts")).toBe(false);
	expect(upgraded.objectStoreNames.contains("scoped-debts")).toBe(false);
	const reading = upgraded.transaction(["scoped-accounts", "application-upgrade"], "readonly");
	expect(await requestResult(reading.objectStore("scoped-accounts").get("user:user_a\u0000a"))).toMatchObject(
		{ data: { yieldFixedRate: 2 }, modifiedAt: 100, syncedAt: 90 },
	);
	expect(
		(await requestResult(reading.objectStore("application-upgrade").get("archive:accounts:a"))).original.data
			.yieldRate,
	).toBe(2);
	expect(upgraded.objectStoreNames.contains("debtPeople")).toBe(false);
	expect(
		await requestResult(
			upgraded.transaction("scoped-debtPeople", "readonly").objectStore("scoped-debtPeople").count(),
		),
	).toBe(0);
	await replaceRemoteSnapshot(
		"debtPeople",
		[{ data: { events: [], id: "person", name: "Lucas Dantas" }, localId: "person", syncedAt: 110 }],
		"user:user_a",
	);
	expect(
		await requestResult(
			upgraded
				.transaction("scoped-debtPeople", "readonly")
				.objectStore("scoped-debtPeople")
				.get("user:user_a\u0000person"),
		),
	).toMatchObject({
		data: { name: "Lucas Dantas" },
		modifiedAt: 110,
		ownerKey: "user:user_a",
		syncedAt: 110,
	});
	expect(
		await requestResult(
			upgraded
				.transaction("application-upgrade", "readonly")
				.objectStore("application-upgrade")
				.get("archive:debtPeople:person"),
		),
	).toMatchObject({ original: { modifiedAt: 90, syncedAt: 90 }, preservedReason: "unresolved-owner" });
	upgraded.onversionchange?.call(upgraded, {} as IDBVersionChangeEvent);
	const reopened = await initLocalDb();
	expect(reopened.version).toBe(14);
	expect(
		await requestResult(
			reopened.transaction("scoped-accounts", "readonly").objectStore("scoped-accounts").count(),
		),
	).toBe(1);
	reopened.close();
});
