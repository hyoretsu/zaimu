import { describe, expect, test } from "bun:test";
import { parseInterCreditCardStatementText } from "./inter-credit-card";

describe("parseInterCreditCardStatementText", () => {
	test("parses purchases on multiple pages and excludes the invoice payment", () => {
		const statement = parseInterCreditCardStatementText(`
Data de Vencimento
25/08/2026
Despesas da fatura
CARTÃO 2306****5248
Data Movimentação Beneficiário Valor
22 de jul. 2026 PAGAMENTO ON LINE - + R$ 312,52
CARTÃO 2306****8642
21 de set. 2025 AMAZONMKTPLC*TAXCONFIG (Parcela 11 de 12) - R$ 11,91
13 de ago. 2026 QMS INTERNACIONAL PROG - R$ 24,88
Próxima fatura
Data de corte: 18/09/2026
DATA DOCUMENTO
18/08/2026
`);

		expect(statement).toEqual({
			dueDate: "2026-08-25",
			provider: "INTER",
			purchases: [
				{
					currentInstallment: 11,
					description: "AMAZONMKTPLC*TAXCONFIG",
					installmentAmount: 11.91,
					installments: 12,
					purchaseDate: "2025-09-21",
					totalAmount: 142.92,
				},
				{
					currentInstallment: 1,
					description: "QMS INTERNACIONAL PROG",
					installmentAmount: 24.88,
					installments: 1,
					purchaseDate: "2026-08-13",
					totalAmount: 24.88,
				},
			],
			statementDate: "2026-08-18",
		});
	});
});
