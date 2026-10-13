import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestResult } from "./idb";

test("retained legacy rows do not abort preference writes or reopening newer schemas", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const opening = indexedDB.open("zaimu-local", 16);
	opening.onupgradeneeded = () => {
		opening.result
			.createObjectStore("application-upgrade", { keyPath: "id" })
			.put({ id: "state", status: "complete", version: 13 });
		opening.result
			.createObjectStore("scoped-debts", { keyPath: "scopedId" })
			.put({ data: { amount: 123 }, scopedId: "legacy-debt" });
		opening.result.createObjectStore("scoped-salaries", { keyPath: "scopedId" });
	};
	const previous = await requestResult(opening);
	previous.close();
	const { initLocalDb, localMeta } = await import("./localStorage");
	const database = await initLocalDb();
	expect(database.objectStoreNames.contains("scoped-debts")).toBe(true);
	expect(database.objectStoreNames.contains("scoped-salaries")).toBe(false);
	expect(
		await requestResult(database.transaction("scoped-debts").objectStore("scoped-debts").get("legacy-debt")),
	).toEqual({ data: { amount: 123 }, scopedId: "legacy-debt" });
	const owner = "guest:preferences-test";
	await localMeta.set("currency-preference", { preferredCurrency: "EUR" }, owner);
	await localMeta.set("institution-country", "PT", owner);
	expect(await localMeta.get("currency-preference", owner)).toEqual({ preferredCurrency: "EUR" });
	expect(await localMeta.get("institution-country", owner)).toBe("PT");

	// Another build may have already advanced the schema past the cleanup version.
	const newer = indexedDB.open("zaimu-local", database.version + 1);
	const advanced = await requestResult(newer);
	const version = advanced.version;
	advanced.close();
	const reopened = await initLocalDb();
	expect(reopened.version).toBe(version);
	expect(await localMeta.get("currency-preference", owner)).toEqual({ preferredCurrency: "EUR" });
	expect(await localMeta.get("institution-country", owner)).toBe("PT");
	reopened.onversionchange?.call(reopened, {} as IDBVersionChangeEvent);
});
