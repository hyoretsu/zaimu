import { describe, expect, test } from "bun:test";
import {
	isPotentialPurchaseRefinancing,
	matchesExistingCreditPurchase,
	requiresPurchaseReconciliation,
} from "./credit-card-import-reconciliation";

const imported = {
	description: "MP* Loja Exemplo",
	installmentAmount: 40.9,
	installments: 11,
	purchaseDate: "2026-04-26",
	storeName: "Loja Exemplo",
	totalAmount: 449.9,
};

describe("matchesExistingCreditPurchase", () => {
	test("matches a partially materialized installment group when its merchant was renamed", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: "Compra manual",
				existingInstallments: 3,
				installmentAmount: "40.90",
				installments: 11,
				purchaseDate: new Date("2026-04-26T12:00:00"),
				storeName: "Loja renomeada",
				totalAmount: "449.90",
			}),
		).toBe(true);
	});

	test("matches a single-installment purchase with a provider amount adjustment", () => {
		expect(
			matchesExistingCreditPurchase(
				{
					description: "ASSINATURA",
					installmentAmount: 11.99,
					installments: 1,
					purchaseDate: "2026-08-07",
					storeName: null,
					totalAmount: 11.99,
				},
				{
					description: "PicPay Mais",
					existingInstallments: 1,
					installmentAmount: 11.9,
					installments: 1,
					purchaseDate: "2026-08-07",
					storeName: null,
					totalAmount: 11.9,
				},
			),
		).toBe(true);
	});

	test("rejects groups that cannot fit the imported parcel plan", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 12,
				installmentAmount: imported.installmentAmount,
				installments: imported.installments,
				purchaseDate: imported.purchaseDate,
				storeName: null,
				totalAmount: imported.totalAmount,
			}),
		).toBe(false);
	});

	test("rejects a different date or installment amount", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 3,
				installmentAmount: 41,
				installments: imported.installments,
				purchaseDate: "2026-04-28",
				storeName: null,
				totalAmount: imported.totalAmount,
			}),
		).toBe(false);
	});

	test("matches installments that differ by up to one real due to provider rounding", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 3,
				installmentAmount: 41.9,
				installments: imported.installments,
				purchaseDate: imported.purchaseDate,
				storeName: null,
				totalAmount: imported.totalAmount,
			}),
		).toBe(true);
	});

	test("rejects installment values outside the one-real rounding margin", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 3,
				installmentAmount: 41.91,
				installments: imported.installments,
				purchaseDate: imported.purchaseDate,
				storeName: null,
				totalAmount: imported.totalAmount,
			}),
		).toBe(false);
	});

	test("rejects a purchase with another installment plan or total", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: "Compra manual",
				existingInstallments: 1,
				installmentAmount: imported.installmentAmount,
				installments: 1,
				purchaseDate: imported.purchaseDate,
				storeName: "Outra loja",
				totalAmount: imported.installmentAmount,
			}),
		).toBe(false);
		expect(
			matchesExistingCreditPurchase(imported, {
				description: "Compra manual",
				existingInstallments: 1,
				installmentAmount: imported.installmentAmount,
				installments: imported.installments,
				purchaseDate: imported.purchaseDate,
				storeName: "Outra loja",
				totalAmount: 448.8,
			}),
		).toBe(false);
	});

	test("accepts a total that differs only by accumulated installment rounding", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: "Compra manual",
				existingInstallments: 1,
				installmentAmount: imported.installmentAmount,
				installments: imported.installments,
				purchaseDate: imported.purchaseDate,
				storeName: "Outra loja",
				totalAmount: 449.8,
			}),
		).toBe(true);
	});

	test("matches a total up to one real apart when installments are reconstructed", () => {
		expect(
			matchesExistingCreditPurchase(
				{ ...imported, totalAmount: 249.28 },
				{
					description: "Compra manual",
					existingInstallments: 1,
					installmentAmount: imported.installmentAmount,
					installments: imported.installments,
					purchaseDate: imported.purchaseDate,
					storeName: "Outra loja",
					totalAmount: 249,
				},
			),
		).toBe(true);
	});
});

describe("isPotentialPurchaseRefinancing", () => {
	const source = {
		description: "Wlingua Premium 12 meses (alemão)",
		existingInstallments: 1,
		installmentAmount: 159.99,
		installments: 1,
		purchaseDate: "2026-01-18",
		storeName: "Play Store",
		totalAmount: 159.99,
	};
	const newPlan = {
		description: "DL * GOOGLE Wlingu",
		installmentAmount: 16.66,
		installments: 12,
		purchaseDate: "2026-01-18",
		storeName: null,
		totalAmount: 199.92,
	};
	test("suggests a renamed merchant and changed total for explicit review", () => {
		expect(isPotentialPurchaseRefinancing(newPlan, source)).toBe(true);
	});
	test("rejects unrelated same-day purchases, credits, same plans and other dates", () => {
		expect(isPotentialPurchaseRefinancing({ ...newPlan, description: "GOOGLE Youtube" }, source)).toBe(false);
		expect(isPotentialPurchaseRefinancing({ ...newPlan, installmentAmount: -16.66 }, source)).toBe(false);
		expect(isPotentialPurchaseRefinancing({ ...newPlan, installments: 1 }, source)).toBe(false);
		expect(isPotentialPurchaseRefinancing({ ...newPlan, purchaseDate: "2026-01-19" }, source)).toBe(false);
	});
});

for (const [date, expected] of [
	["2026-04-25", true],
	["2026-04-26", true],
	["2026-04-27", true],
	["2026-04-24", false],
	["2026-04-28", false],
] as const) {
	test(`purchase date tolerance: ${date}`, () => {
		expect(
			matchesExistingCreditPurchase(
				imported,
				{ ...imported, existingInstallments: 1, purchaseDate: date },
				1,
			),
		).toBe(expected);
	});
}
test("edited imports require field reconciliation; untouched imports can link automatically", () => {
	const createdAt = "2026-04-27T10:00:00Z";
	expect(requiresPurchaseReconciliation({ createdAt, updatedAt: createdAt })).toBe(false);
	expect(requiresPurchaseReconciliation({ createdAt, updatedAt: "2026-04-27T10:01:00Z" })).toBe(true);
});
