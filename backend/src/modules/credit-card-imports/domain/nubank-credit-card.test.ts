import { describe, expect, test } from "bun:test";
import { parseNubankCreditCardStatementText } from "./nubank-credit-card";

describe("parseNubankCreditCardStatementText", () => {
	test("parses purchases, installments, and international transaction details", () => {
		const statement = parseNubankCreditCardStatementText(`
Data de vencimento: 24 AGO 2026
Período vigente: 17 JUL a 17 AGO
TRANSAÇÕES DE 17 JUL A 17 AGO
17 JUL Amazon BR VI - NuPay - Parcela 5/6 R$ 30,66
29 JUL •••• 9413 Lojas Americanas - Parcela 1/4 R$ 20,65
07 AGO •••• 9413 Patreon* Membership
USD 4.00
Conversão: USD 1 = R$ 5,30
R$ 21,22
Pagamentos -R$ 132,18
24 JUL Pagamento em 24 JUL −R$ 132,18
`);

		expect(statement).toEqual({
			dueDate: "2026-08-24",
			provider: "NUBANK",
			purchases: [
				{
					currentInstallment: 5,
					description: "Amazon BR VI - NuPay",
					installmentAmount: 30.66,
					installments: 6,
					purchaseDate: "2026-03-17",
					totalAmount: 183.96,
				},
				{
					currentInstallment: 1,
					description: "Lojas Americanas",
					installmentAmount: 20.65,
					installments: 4,
					purchaseDate: "2026-07-29",
					totalAmount: 82.6,
				},
				{
					currentInstallment: 1,
					description: "Patreon* Membership",
					installmentAmount: 21.22,
					installments: 1,
					purchaseDate: "2026-08-07",
					totalAmount: 21.22,
				},
			],
			statementDate: "2026-08-17",
		});
	});
});

test("preserves refund signs without importing invoice payments", () => {
	const result = parseNubankCreditCardStatementText(`Data de vencimento: 24 AGO 2026
Período vigente: 17 JUL a 17 AGO
TRANSAÇÕES DE 17 JUL A 17 AGO
01 AGO LOJA R$ 100,00
02 AGO Estorno LOJA -R$ 25,00
03 AGO Estorno LOJA R$ -10,00
04 AGO Estorno LOJA
−R$ 5,00
Pagamentos -R$ 100,00
05 AGO Pagamento em 05 AGO −R$ 100,00`);
	expect(result.purchases.map(p => p.installmentAmount)).toEqual([100, -25, -10, -5]);
	expect(result.purchases.map(p => p.totalAmount)).toEqual([100, -25, -10, -5]);
});
