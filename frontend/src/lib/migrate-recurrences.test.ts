import { expect, test } from "bun:test";
import type { LocalData } from "./localStorage";
import { migrateLocalRecurrenceRows } from "./migrate-recurrences";

const wrap = (data: Record<string, unknown>, owner = "user:a"): LocalData<unknown> => ({
	data,
	localId: String(data.id),
	modifiedAt: 123,
	ownerKey: owner as "user:a",
	scopedId: `${owner}\u0000${data.id}`,
	syncedAt: 110,
});
test("owner-scoped migration preserves collisions, pending changes, deletion and cursor", () => {
	const legacy = {
		amount: 10,
		financialAccountId: "account",
		frequency: "BIWEEKLY",
		id: "same",
		isActive: true,
		name: "Payment",
		startDate: "2024-01-01",
		userId: "a",
	};
	const snapshot = {
		creditBooks: [],
		creditCards: [wrap({ financialAccountId: "card-account", id: "card" })],
		recurrenceOccurrences: [],
		recurrences: [],
		recurringPayments: [wrap(legacy)],
		salaries: [
			wrap({
				...legacy,
				frequency: "MONTHLY",
				materializedThrough: "2026-09-20",
				payDay: 1,
				source: "Generic receipt",
			}),
			wrap({ ...legacy, payDay: 1, source: "Other owner", userId: "b" }, "user:b"),
		],
		subscriptions: [
			{
				...wrap({
					...legacy,
					financialAccountId: "card-account",
					materializedThrough: "2026-09-21",
					paymentMethod: "CREDIT",
				}),
				deleted: true,
			},
		],
		transactions: [
			{
				...wrap({
					amount: 10,
					date: "2026-09-09",
					id: "t",
					salaryId: "same",
					salaryOccurrenceDate: "2026-09-01",
				}),
				deleted: true,
			},
		],
	};
	const result = migrateLocalRecurrenceRows(snapshot, "2026-10-01");
	expect(result.recurrences).toHaveLength(4);
	const salary = result.recurrences.find(
		row => (row.data as any).legacySource === "salary" && row.ownerKey === "user:a",
	)!;
	expect(salary.modifiedAt).toBe(123);
	expect(salary.syncedAt).toBe(110);
	expect((salary.data as any).materializedThrough).toBe("2026-09-20");
	expect((salary.data as any).id).not.toBe("same");
	expect((result.transactions[0]!.data as any).recurrenceId).toBe((salary.data as any).id);
	expect((result.recurrenceOccurrences[0]!.data as any).date).toBe("2026-09-01");
	expect((result.recurrenceOccurrences[0]!.data as any).deletedAt).toBe("2026-10-01");
	const purchase = result.recurrences.find(row => (row.data as any).legacySource === "subscription")!;
	expect(purchase.deleted).toBe(true);
	expect((purchase.data as any).creditCardId).toBe("card");
	const rerun = migrateLocalRecurrenceRows(
		{
			...snapshot,
			recurrenceOccurrences: result.recurrenceOccurrences,
			recurrences: result.recurrences,
			transactions: result.transactions,
		},
		"2026-10-02",
	);
	expect(rerun.recurrences).toHaveLength(0);
	expect(rerun.recurrenceOccurrences).toHaveLength(0);
});
