import { describe, expect, test } from "bun:test";
import { parsePicPayCreditCardStatementText } from "./picpay-credit-card";

describe("parsePicPayCreditCardStatementText", () => {
	test("parses purchases from every card and excludes the invoice payment", () => {
		const statement = parsePicPayCreditCardStatementText(`
25/08/2026 | 19/08/2026 Vencimento: Fechamento:
Picpay Card
Transações Nacionais
Data Estabelecimento Valor (R$)
23/07 PAGAMENTO DE FATURA -140,05
07/08 ASSINATURA 11,99
Subtotal dos lançamentos 20,88
Picpay Card final 3031
Transações Nacionais
Data Estabelecimento Valor (R$)
23/09 AMAZONMKTPLC*RPARC11/12 6,46
30/10 AMAZON MARKETPPARC10/12 16,59
Subtotal dos lançamentos 23,05
`);

		expect(statement).toEqual({
			dueDate: "2026-08-25",
			provider: "PICPAY",
			purchases: [
				{
					currentInstallment: 1,
					description: "ASSINATURA",
					installmentAmount: 11.99,
					installments: 1,
					purchaseDate: "2026-08-07",
					totalAmount: 11.99,
				},
				{
					currentInstallment: 11,
					description: "AMAZONMKTPLC*R",
					installmentAmount: 6.46,
					installments: 12,
					purchaseDate: "2025-09-23",
					totalAmount: 77.52,
				},
				{
					currentInstallment: 10,
					description: "AMAZON MARKETP",
					installmentAmount: 16.59,
					installments: 12,
					purchaseDate: "2025-10-30",
					totalAmount: 199.08,
				},
			],
			statementDate: "2026-08-19",
		});
	});
});
