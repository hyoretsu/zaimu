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
	test("matches a partially materialized installment group by store", () => {
		expect(
			matchesExistingCreditPurchase(imported, {
				description: "Descrição editada",
				existingInstallments: 3,
				installmentAmount: "40.90",
				purchaseDate: new Date("2026-04-26T12:00:00"),
				storeName: " loja exemplo ",
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
});
