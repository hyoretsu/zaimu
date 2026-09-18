import { expect, test } from "bun:test";
import { assignCreditCardPurchaseExternalIds } from "./credit-card-import-identity";

test("financed installments keep the same identity when the monthly IOF changes", () => {
	const base = {
		currentInstallment: 10,
		description: "FIN CINEPOLIS · IOF R$ 0,18",
		installmentAmount: 10.34,
		installments: 16,
		purchaseDate: "2025-11-09",
		totalAmount: 165.44,
	};
	const first = assignCreditCardPurchaseExternalIds([base], "card")[0]!;
	const next = assignCreditCardPurchaseExternalIds(
		[
			{
				...base,
				currentInstallment: 11,
				description: "FIN CINEPOLIS · IOF R$ 0,21",
				installmentAmount: 10.37,
				totalAmount: 165.92,
			},
		],
		"card",
	)[0]!;
	expect(next.externalId).toBe(first.externalId);
	expect(
		assignCreditCardPurchaseExternalIds([{ ...base, installments: 11 }], "card")[0]!.externalId,
	).not.toBe(first.externalId);
});
