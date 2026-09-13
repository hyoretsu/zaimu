import { describe, expect, test } from "bun:test";
import { matchesExistingCreditPurchase } from "./credit-card-import-reconciliation";

const imported = {
	description: "MP* Loja Exemplo",
	installmentAmount: 40.9,
	installments: 11,
	purchaseDate: "2026-04-26",
	storeName: "Loja Exemplo",
};

describe("matchesExistingCreditPurchase", () => {
	test("matches a partially materialized installment group when its merchant was renamed", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: "Compra manual",
				existingInstallments: 3,
				installmentAmount: "40.90",
				purchaseDate: new Date("2026-04-26T12:00:00"),
				storeName: "Loja renomeada",
			}),
		).toBe(true);
	});

	test("rejects groups that cannot fit the imported parcel plan", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 12,
				installmentAmount: imported.installmentAmount,
				purchaseDate: imported.purchaseDate,
				storeName: null,
			}),
		).toBe(false);
	});

	test("rejects a different date or installment amount", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 3,
				installmentAmount: 41,
				purchaseDate: "2026-04-27",
				storeName: null,
			}),
		).toBe(false);
	});

	test("matches installments that differ by up to twenty cents due to provider rounding", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 3,
				installmentAmount: 41.1,
				purchaseDate: imported.purchaseDate,
				storeName: null,
			}),
		).toBe(true);
	});

	test("rejects installment values outside the twenty-cent rounding margin", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: imported.description,
				existingInstallments: 3,
				installmentAmount: 41.11,
				purchaseDate: imported.purchaseDate,
				storeName: null,
			}),
		).toBe(false);
	});
});
