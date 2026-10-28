import { expect, test } from "bun:test";
import { sanitizeTransferReview } from "./sanitize-transfer-review";
test("scrubs embedded private links while preserving financial evidence and moved IDs", () => {
	expect(
		sanitizeTransferReview(
			{
				amount: 123,
				categoryId: "old-tag",
				debtSplit: { amount: 10, personId: "person" },
				description: "private",
				externalId: "private",
				originFinancialAccountId: "private",
				purchaseId: "moved",
				userId: "sender",
			},
			new Set(["sender", "private", "old-tag"]),
			new Set(["moved"]),
			new Map([["old-tag", "new-tag"]]),
			"sender",
			"recipient",
		),
	).toEqual({
		amount: 123,
		categoryId: "new-tag",
		debtSplit: null,
		description: "private",
		externalId: "private",
		originFinancialAccountId: null,
		purchaseId: "moved",
		userId: "recipient",
	});
});
