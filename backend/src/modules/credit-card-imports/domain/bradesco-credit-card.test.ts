import { describe, expect, test } from "bun:test";
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
					description: "AMAZON RETAIL BR CPI SAO PAULO(11/12)",
					installmentAmount: 17.12,
					installments: 12,
					purchaseDate: "2025-09-17",
					totalAmount: 205.44,
				},
				{
					currentInstallment: 10,
					description: "AMAZON RETAIL CPI SAO PAULO(10/12)",
					installmentAmount: 21.66,
					installments: 12,
					purchaseDate: "2025-11-04",
					totalAmount: 259.92,
				},
				{
					currentInstallment: 1,
					description: "AMAZONMKTPLC*NOVASDNCO SAO PAULO(01/05)",
					installmentAmount: 11.38,
					installments: 5,
					purchaseDate: "2026-07-19",
					totalAmount: 56.9,
				},
				{
					currentInstallment: 1,
					description: "AMAZON BR SAO PAULO(01/02)",
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
