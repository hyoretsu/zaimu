import { expect, test } from "bun:test";
import { assignCreditCardPurchaseExternalIds } from "./credit-card-import-identity";
import { parsePicPayCreditCardStatementText } from "./picpay-credit-card";

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

test("original-source reference survives different financed amounts across invoices", () => {
	const initial = parsePicPayCreditCardStatementText(`
25-11-2025 | 18-11-2025 Vencimento: Fechamento:
Picpay Card
Transações Nacionais
Data Estabelecimento Valor
09/11 FIN CINEPOLIS PARC01/16 10,32
09/11 IOF ADICIONAL PARCELADO 0,02
09/11 CREDITO PARCELAMENTO COMPRA -105,00
17/10 CINEPOLIS OPERADORA DE 105,00
Total geral dos lançamentos 10,34
`);
	const first = assignCreditCardPurchaseExternalIds(initial.purchases, "card");
	const later = assignCreditCardPurchaseExternalIds(
		[
			{
				...first[0]!,
				currentInstallment: 10,
				description: "FIN CINEPOLIS · IOF R$ 0,18",
				installmentAmount: 10.16 + 0.18,
			},
		],
		"card",
	);
	expect(first[0]!.externalId).toBe(later[0]!.externalId);
	expect(first[0]!.financingSourceExternalId).toBe(first[1]!.externalId);
	expect(first[1]!.financingTargetExternalId).toBe(first[0]!.externalId);
});
