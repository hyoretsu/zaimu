import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestResult, transactionDone } from "../idb";
import { resolveUpgradeRecurrenceIds } from "./resolve-recurrence-ids";

test("server collision resolution preserves concurrent local edits and detaches deleted destinations", async () => {
	const opening = new IDBFactory().open("resolution", 1);
	opening.onupgradeneeded = () => {
		opening.result.createObjectStore("application-upgrade", { keyPath: "id" });
		for (const domain of ["recurrences", "recurrenceOccurrences", "transactions", "creditBooks"])
			opening.result
				.createObjectStore(`scoped-${domain}`, { keyPath: "scopedId" })
				.createIndex("ownerKey", "ownerKey");
	};
	const database = await requestResult(opening);
	const owner = "user:owner" as const;
	const wrap = (data: Record<string, unknown>) => ({
		data,
		localId: data.id,
		modifiedAt: 10,
		ownerKey: owner,
		scopedId: `${owner}\u0000${data.id}`,
		syncedAt: 5,
	});
	try {
		const tx = database.transaction(Array.from(database.objectStoreNames), "readwrite");
		const done = transactionDone(tx);
		tx.objectStore("application-upgrade").put({
			id: "mapping",
			legacyId: "same",
			ownerKey: owner,
			recurrenceId: "local-uuid",
			source: "salary",
		});
		tx.objectStore("application-upgrade").put({
			id: "deleted",
			legacyId: "old",
			ownerKey: owner,
			recurrenceId: "local-deleted",
			source: "subscription",
		});
		tx.objectStore("application-upgrade").put({
			id: "foreign",
			legacyId: "same",
			ownerKey: "user:other",
			recurrenceId: "foreign",
			source: "salary",
		});
		tx.objectStore("scoped-recurrences").put(wrap({ id: "local-uuid", name: "Before" }));
		tx.objectStore("scoped-recurrences").put(wrap({ id: "local-deleted", name: "Removed" }));
		tx.objectStore("scoped-transactions").put(wrap({ amount: 17, id: "tx", recurrenceId: "local-deleted" }));
		tx.objectStore("scoped-recurrenceOccurrences").put(
			wrap({
				date: "2026-01-01",
				deletedAt: "2026-01-02",
				id: "local-deleted:2026-01-01",
				recurrenceId: "local-deleted",
			}),
		);
		await done;
		await resolveUpgradeRecurrenceIds(database, owner, async ids => {
			expect(ids).toHaveLength(2);
			const edits = database.transaction("scoped-recurrences", "readwrite");
			const edited = transactionDone(edits);
			edits
				.objectStore("scoped-recurrences")
				.put({ ...wrap({ id: "local-uuid", name: "During request" }), modifiedAt: 11 });
			await edited;
			return [
				{ deleted: false, legacyId: "same", recurrenceId: "server-md5", source: "salary" },
				{ deleted: true, legacyId: "old", recurrenceId: "deleted-server", source: "subscription" },
			];
		});
		const check = database.transaction(Array.from(database.objectStoreNames), "readonly");
		expect(
			await requestResult(check.objectStore("scoped-recurrences").get(`${owner}\u0000server-md5`)),
		).toMatchObject({ data: { name: "During request" }, modifiedAt: 11, syncedAt: 5 });
		expect(
			await requestResult(check.objectStore("scoped-transactions").get(`${owner}\u0000tx`)),
		).toMatchObject({ data: { amount: 17, recurrenceId: undefined } });
		expect(await requestResult(check.objectStore("scoped-recurrenceOccurrences").count())).toBe(0);
		expect(
			(await requestResult(check.objectStore("application-upgrade").get("foreign"))).resolved,
		).toBeUndefined();
	} finally {
		database.close();
	}
});
