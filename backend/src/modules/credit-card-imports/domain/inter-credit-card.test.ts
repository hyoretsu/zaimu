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

test("preserves refund signs without importing invoice payments", () => {
	const result = parseInterCreditCardStatementText(`Data de Vencimento 25/08/2026
Despesas da fatura
13 de ago. 2026 LOJA - R$ 100,00
14 de ago. 2026 LOJA - + R$ 25,00
15 de ago. 2026 Estorno LOJA - + R$ 10,00
16 de ago. 2026 PAGAMENTO ON LINE - + R$ 100,00
Próxima fatura`);
	expect(result.purchases.map(p => p.installmentAmount)).toEqual([100, -25, -10]);
	expect(result.purchases.map(p => p.totalAmount)).toEqual([100, -25, -10]);
});

for (const fixture of [
	{ closing: "2024-02-24", count: 12, due: "2024-03-01", month: "02", total: 580.76 },
	{ closing: "2024-08-31", count: 16, due: "2024-09-07", month: "08", total: 2211.8 },
	{ closing: "2024-09-30", count: 18, due: "2024-10-07", month: "09", total: 8815.97 },
]) {
	test(`reads Inter 2024-${fixture.month} PDF text including missing font glyphs`, async () => {
		const text = await Bun.file(
			new URL(`./fixtures/inter-2024-${fixture.month}.txt`, import.meta.url),
		).text();
		const statement = parseInterCreditCardStatementText(text.replaceAll("\\u0000", "\u0000"));
		expect(statement.dueDate).toBe(fixture.due);
		expect(statement.statementDate).toBe(fixture.closing);
		expect(statement.purchases).toHaveLength(fixture.count);
		expect(
			statement.purchases.reduce((sum, purchase) => sum + purchase.installmentAmount, 0),
		).toBeCloseTo(fixture.total, 2);
		expect(
			statement.purchases.some(purchase =>
				/pagamento|NÃO IMPORTAR|Principal/iu.test(purchase.description),
			),
		).toBe(false);
		expect(
			statement.purchases.find(purchase =>
				/Par Shop Inter Mais|PAR SHOP INTER MAIS/u.test(purchase.description),
			)?.installments,
		).toBe(10);
		if (fixture.month === "08") expect(statement.purchases[0]?.installmentAmount).toBe(-5);
		if (fixture.month === "09") {
			const pix = statement.purchases.find(purchase => purchase.description === "PIX CRED PARCELADO");
			expect(pix).toMatchObject({ currentInstallment: 3, installmentAmount: 262.31, installments: 4 });
		}
	});
}
