import { describe, expect, test } from "bun:test";
import { parseMercadoPagoCreditCardStatementText } from "./mercado-pago-credit-card";

const header = `
Vence em
20/08/2026
Cartão Visa [************9965]
Data Movimentações Valor em R$
`;
const footer = `
Total R$ 361,18
Fechamento da fatura 15/08/2026
Parcele a fatura
`;

describe("parseMercadoPagoCreditCardStatementText", () => {
	test("parses purchases and moves installments back to their first installment date", () => {
		const result = parseMercadoPagoCreditCardStatementText(`${header}
27/10 MP*4TRONICS Parcela 10 de 11 R$ 23,03
03/08 MERCADOLIVRE*SMARTTECH R$ 24,19
08/08 MERCADOLIVRE*MERCADOLIVRE Parcela 1 de 8 R$ 31,16
${footer}`);

		expect(result.statementDate).toBe("2026-08-15");
		expect(result.dueDate).toBe("2026-08-20");
		expect(result.purchases).toEqual([
			{
				currentInstallment: 10,
				description: "MP*4TRONICS",
				installmentAmount: 23.03,
				installments: 11,
				purchaseDate: "2025-10-27",
				totalAmount: 253.33,
			},
			{
				currentInstallment: 1,
				description: "MERCADOLIVRE*SMARTTECH",
				installmentAmount: 24.19,
				installments: 1,
				purchaseDate: "2026-08-03",
				totalAmount: 24.19,
			},
			{
				currentInstallment: 1,
				description: "MERCADOLIVRE*MERCADOLIVRE",
				installmentAmount: 31.16,
				installments: 8,
				purchaseDate: "2026-08-08",
				totalAmount: 249.28,
			},
		]);
	});

	test("does not import the invoice payment", () => {
		const result = parseMercadoPagoCreditCardStatementText(`
Vence em 20/08/2026
19/07 Pagamento da fatura de julho/2026 R$ 389,76
${header}
13/08 MP*MELIMAIS R$ 9,90
${footer}`);
		expect(result.purchases.map(purchase => purchase.description)).toEqual(["MP*MELIMAIS"]);
	});
});
