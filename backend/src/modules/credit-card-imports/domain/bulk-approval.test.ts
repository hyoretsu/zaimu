import { describe, expect, test } from "bun:test";
import { canBulkApprovePurchase } from "./bulk-approval";

const rawPurchase = {
	installmentAmount: "17.66",
	metadataMissing: [] as string[],
	reconciledCreditPurchaseId: null,
};

describe("bulk purchase approval", () => {
	test("keeps unmatched purchases pending unless explicitly included", () => {
		expect(canBulkApprovePurchase(rawPurchase, false, false)).toBe(false);
		expect(canBulkApprovePurchase(rawPurchase, false, true)).toBe(true);
	});

	test("includes existing purchase matches regardless of the unmatched choice", () => {
		const matched = { ...rawPurchase, reconciledCreditPurchaseId: "existing-purchase" };
		expect(canBulkApprovePurchase(matched, false, false)).toBe(true);
		expect(canBulkApprovePurchase(matched, false, true)).toBe(true);
	});

	test("including unmatched purchases never bypasses pending review", () => {
		for (const includeUnmatched of [false, true]) {
			const matched = { ...rawPurchase, reconciledCreditPurchaseId: "existing-purchase" };
			expect(canBulkApprovePurchase(matched, true, includeUnmatched)).toBe(false);
			expect(
				canBulkApprovePurchase({ ...matched, metadataMissing: ["purchaseDate"] }, false, includeUnmatched),
			).toBe(false);
			expect(canBulkApprovePurchase({ ...matched, installmentAmount: -10 }, false, includeUnmatched)).toBe(
				false,
			);
		}
	});
});
