import { expect, test } from "bun:test";
import { getCreditPurchaseSyncStatus } from "./credit-purchase-sync-status";

test("marks each imported installment and its root when every current or past installment is imported", () => {
	const statuses = getCreditPurchaseSyncStatus(
		[
			{
				hasImportedAmount: true,
				id: "root",
				installments: 3,
				parentId: null,
				statementDate: new Date("2026-08-15"),
			},
			{
				hasImportedAmount: true,
				id: "second",
				installments: 3,
				parentId: "root",
				statementDate: new Date("2026-09-15"),
			},
			{
				hasImportedAmount: false,
				id: "future",
				installments: 3,
				parentId: "root",
				statementDate: new Date("2026-10-15"),
			},
		],
		new Date("2026-09-20"),
	);
	expect(statuses.get("root")).toEqual({ isFullySynced: true, isSynced: false });
	expect(statuses.get("second")).toEqual({ isFullySynced: false, isSynced: true });
});
