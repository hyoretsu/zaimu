import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { requestResult, transactionDone } from "../idb";
import { migrateDebts, settlementId } from "./migrate-debts";

test("paid origins retain dated compensation, owners, clocks and deletion; collisions roll back", async () => {
	const opening = new IDBFactory().open("debts", 1);
	opening.onupgradeneeded = () => {
		for (const name of ["scoped-debts", "scoped-debtPeople", "scoped-debtEvents"])
			opening.result.createObjectStore(name, { keyPath: "scopedId" });
		opening.result.createObjectStore("application-upgrade", { keyPath: "id" });
	};
	const database = await requestResult(opening);
	const names = Array.from(database.objectStoreNames);
	const seed = database.transaction(names, "readwrite");
	const seeded = transactionDone(seed);
	for (const ownerKey of ["guest:a", "user:b"])
		seed
			.objectStore("scoped-debts")
			.put({
				data: {
					amount: 12,
					date: "2025-01-01",
					id: "debt",
					isOwedToMe: true,
					isPaid: true,
					paidDate: "2025-02-02",
					personName: "Ana",
					userId: ownerKey.slice(6),
				},
				deleted: ownerKey === "user:b",
				localId: "debt",
				modifiedAt: 123,
				ownerKey,
				scopedId: `${ownerKey}\u0000debt`,
				syncedAt: 111,
			});
	await seeded;
	const tx = database.transaction(names, "readwrite");
	const done = transactionDone(tx);
	await migrateDebts(tx);
	await done;
	const rows = await requestResult(
		database.transaction("scoped-debtEvents", "readonly").objectStore("scoped-debtEvents").getAll(),
	);
	expect(rows).toHaveLength(4);
	expect(rows.filter(row => row.ownerKey === "guest:a").reduce((sum, row) => sum + row.data.effect, 0)).toBe(
		0,
	);
	expect(rows.find(row => row.data.kind === "MIGRATED_SETTLEMENT")!.data.date).toBe("2025-02-02");
	expect(rows.every(row => row.modifiedAt === 123 && row.syncedAt === 111)).toBe(true);
	expect(rows.filter(row => row.ownerKey === "user:b").every(row => row.deleted)).toBe(true);
	const retry = database.transaction(names, "readwrite");
	const retried = transactionDone(retry);
	await migrateDebts(retry);
	await retried;
	expect(
		await requestResult(
			database.transaction("scoped-debtEvents", "readonly").objectStore("scoped-debtEvents").count(),
		),
	).toBe(4);
	const conflict = database.transaction(names, "readwrite");
	const conflicted = transactionDone(conflict);
	conflict
		.objectStore("scoped-debts")
		.put({
			data: { amount: 10, id: "collision", isOwedToMe: true, isPaid: true, personName: "Ana" },
			localId: "collision",
			modifiedAt: 123,
			ownerKey: "guest:a",
			scopedId: "guest:a\u0000collision",
		});
	conflict
		.objectStore("scoped-debtEvents")
		.put({ data: { id: settlementId("collision") }, scopedId: `guest:a\u0000${settlementId("collision")}` });
	await conflicted;
	const failed = database.transaction(names, "readwrite");
	const failure = transactionDone(failed);
	await expect(migrateDebts(failed)).rejects.toThrow("Colisão");
	failed.abort();
	await failure.catch(() => undefined);
	expect(
		await requestResult(
			database
				.transaction("scoped-debtEvents", "readonly")
				.objectStore("scoped-debtEvents")
				.get("guest:a\u0000collision"),
		),
	).toBeUndefined();
	database.close();
});
