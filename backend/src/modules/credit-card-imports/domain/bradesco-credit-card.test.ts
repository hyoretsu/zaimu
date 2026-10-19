import { describe, expect, test } from "bun:test";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { parseBradescoCreditCardStatementText } from "./bradesco-credit-card";

describe("parseBradescoCreditCardStatementText", () => {
	test("parses purchases, installments, and excludes the invoice payment", () => {
		const statement = parseBradescoCreditCardStatementText(`
Fatura mensal
Total da fatura R$ 186,96 Vencimento 25/08/2026
A previsão de fechamento da sua próxima fatura é dia 11/09/2026
Lançamentos
Data Descrição Valor R$
Nacionais em Reais (R$)
ARAN L GUSMAO 5373.63**.****.6018
17/09 AMAZON RETAIL BR CPI SAO PAULO(11/12) 17,12
04/11 AMAZON RETAIL CPI SAO PAULO(10/12) 21,66
19/07 AMAZONMKTPLC*NOVASDNCO SAO PAULO(01/05) 11,38
27/07 PAGAMENTO RECEBIDO - OBRIGADO 176,47 -
30/07 AMAZON BR SAO PAULO(01/02) 13,01
Total parcelado para as próximas faturas R$ 567,57
`);

		expect(statement).toEqual({
			dueDate: "2026-08-25",
			provider: "BRADESCO",
			purchases: [
				{
					currentInstallment: 11,
					description: "AMAZON RETAIL BR CPI SAO PAULO",
					installmentAmount: 17.12,
					installments: 12,
					purchaseDate: "2025-09-17",
					totalAmount: 205.44,
				},
				{
					currentInstallment: 10,
					description: "AMAZON RETAIL CPI SAO PAULO",
					installmentAmount: 21.66,
					installments: 12,
					purchaseDate: "2025-11-04",
					totalAmount: 259.92,
				},
				{
					currentInstallment: 1,
					description: "AMAZONMKTPLC*NOVASDNCO SAO PAULO",
					installmentAmount: 11.38,
					installments: 5,
					purchaseDate: "2026-07-19",
					totalAmount: 56.9,
				},
				{
					currentInstallment: 1,
					description: "AMAZON BR SAO PAULO",
					installmentAmount: 13.01,
					installments: 2,
					purchaseDate: "2026-07-30",
					totalAmount: 26.02,
				},
			],
			statementDate: "2026-08-25",
		});
	});
});

test("keeps the Amazon May refund negative and separate from accelerated installments", () => {
	const statement = parseBradescoCreditCardStatementText(`
Fatura mensal
Total da fatura R$ 125,33 Vencimento 25/05/2026
Nacionais em Reais (R$)
30/04 AMAZON BR SAO PAULO(01/08) 22,03
30/04 AMAZON BR SAO PAULO(02/08) 22,00
30/04 AMAZON BR SAO PAULO(03/08) 22,00
30/04 AMAZON BR SAO PAULO(04/08) 22,00
30/04 AMAZON BR SAO PAULO(05/08) 22,00
30/04 AMAZON BR SAO PAULO(06/08) 22,00
30/04 AMAZON BR SAO PAULO(07/08) 22,00
30/04 AMAZON BR SAO PAULO(08/08) 22,00
30/04 AMAZON BR SAO PAULO BRA 176,03 -
27/04 PAGAMENTO RECEBIDO - OBRIGADO 160,71 -
Total parcelado para as próximas faturas R$ 293,01
`);
	expect(statement.purchases).toHaveLength(3);
	const [original, purchase, refund] = statement.purchases;
	expect(original!.totalAmount).toBe(176.03);
	expect(original!.installments).toBe(8);
	expect(importedAnticipation(original!.description)).toBeNull();
	expect(purchase!.totalAmount).toBe(176.03);
	expect(importedAnticipation(purchase!.description)).toHaveLength(8);
	expect(refund).toEqual({
		currentInstallment: 1,
		description: "AMAZON BR SAO PAULO BRA",
		installmentAmount: -176.03,
		installments: 1,
		purchaseDate: "2026-04-30",
		totalAmount: -176.03,
	});
	expect(importedAnticipation(refund!.description)).toBeNull();
	expect(
		Math.round(statement.purchases.slice(1).reduce((sum, item) => sum + item.totalAmount, 0) * 100),
	).toBe(0);
});
