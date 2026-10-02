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
		opening.result.createObjectStore("accounts", { keyPath: "localId" });
		opening.result.createObjectStore("application-upgrade", { keyPath: "id" });
	};
	const old = await requestResult(opening);
	const tx = old.transaction(["accounts", "application-upgrade"], "readwrite");
	const done = transactionDone(tx);
	tx.objectStore("accounts").put({
		data: { id: "a", userId: "user_a", yieldRate: 2 },
		localId: "a",
		modifiedAt: 100,
		syncedAt: 90,
	});
	tx.objectStore("application-upgrade").put({ id: "state", status: "complete", version: 12 });
	await done;
	old.close();
	const { initLocalDb } = await import("../localStorage");
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
