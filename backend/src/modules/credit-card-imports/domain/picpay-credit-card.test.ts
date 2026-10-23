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

test("groups each financed operation with its own daily and additional IOF", () => {
	const statement = parsePicPayCreditCardStatementText(`
25/08/2026 | 19/08/2026 Vencimento: Fechamento:
Operações de crédito contratados
Data Operação Valor (R$)
09/11 FIN CINEPOLIS PARC10/16 10,16
09/11 IOF DIARIO PARCELADO 0,16
09/11 IOF ADICIONAL PARCELADO 0,02
09/11 FIN CINEPOLIS PARC10/11 10,30
09/11 IOF DIARIO PARCELADO 0,22
09/11 IOF ADICIONAL PARCELADO 0,02
Transações Nacionais
Data Estabelecimento Valor (R$)
07/08 ASSINATURA 11,99
Subtotal dos lançamentos 11,99
`);
	expect(statement.purchases).toEqual([
		{
			currentInstallment: 10,
			description: "FIN CINEPOLIS · IOF R$ 0,18",
			installmentAmount: 10.34,
			installments: 16,
			purchaseDate: "2025-11-09",
			totalAmount: 165.44,
		},
		{
			currentInstallment: 10,
			description: "FIN CINEPOLIS · IOF R$ 0,24",
			installmentAmount: 10.54,
			installments: 11,
			purchaseDate: "2025-11-09",
			totalAmount: 115.94,
		},
		{
			currentInstallment: 1,
			description: "ASSINATURA",
			installmentAmount: 11.99,
			installments: 1,
			purchaseDate: "2026-08-07",
			totalAmount: 11.99,
		},
	]);
});

test("links two same-merchant financings to distinct original purchases via their statement credits", () => {
	const statement = parsePicPayCreditCardStatementText(`
25-11-2025 | 18-11-2025 Vencimento: Fechamento:
Picpay Card
Transações Nacionais
Data Estabelecimento Valor
09/11 FIN CINEPOLIS PARC01/16 10,32
09/11 IOF ADICIONAL PARCELADO 0,02
09/11 FIN CINEPOLIS PARC01/11 10,52
09/11 IOF ADICIONAL PARCELADO 0,02
09/11 CREDITO PARCELAMENTO COMPRA -105,00
09/11 CREDITO PARCELAMENTO COMPRA -84,00
17/10 CINEPOLIS OPERADORA DE 105,00
17/10 CINEPOLIS OPERADORA DE 84,00
Total geral dos lançamentos 21,88
`);
	expect(statement.purchases).toHaveLength(4);
	expect(statement.purchases[0]).toMatchObject({
		currentInstallment: 1,
		description: "FIN CINEPOLIS · IOF R$ 0,02",
		financingSourceIndex: 2,
		installmentAmount: 10.34,
		installments: 16,
	});
	expect(statement.purchases[1]).toMatchObject({
		financingSourceIndex: 3,
		installmentAmount: 10.54,
		installments: 11,
	});
	expect(statement.purchases[2]).toMatchObject({
		description: "CINEPOLIS OPERADORA DE",
		installmentAmount: 105,
	});
	expect(statement.purchases[3]).toMatchObject({
		description: "CINEPOLIS OPERADORA DE",
		installmentAmount: 84,
	});
});

test("keeps an unrelated negative refund instead of mistaking it for a financing credit", () => {
	const statement = parsePicPayCreditCardStatementText(`
25-11-2025 | 18-11-2025 Vencimento: Fechamento:
Picpay Card
Transações Nacionais
Data Estabelecimento Valor
17/10 PAGAMENTO DE FATURA PELO PICPA -506,89
17/10 CINEPOLIS OPERADORA DE -92,10
17/10 ASSINATURA 18,99
Total geral dos lançamentos 18,99
`);
	expect(statement.purchases).toEqual([
		{
			currentInstallment: 1,
			description: "Reembolso - CINEPOLIS OPERADORA DE",
			installmentAmount: -92.1,
			installments: 1,
			purchaseDate: "2025-10-17",
			totalAmount: -92.1,
		},
		{
			currentInstallment: 1,
			description: "ASSINATURA",
			installmentAmount: 18.99,
			installments: 1,
			purchaseDate: "2025-10-17",
			totalAmount: 18.99,
		},
	]);
});

test("preserves refund signs without importing invoice payments", () => {
	const result = parsePicPayCreditCardStatementText(`Vencimento: 20/08/2026
Fechamento: 15/08/2026
Transações Nacionais
Data Estabelecimento Valor (R$)
01/08 LOJA 100,00
02/08 LOJA -25,00
03/08 LOJA −10,00
04/08 PAGAMENTO DE FATURA -100,00
Subtotal dos lançamentos`);
	expect(result.purchases.map(p => p.installmentAmount)).toEqual([100, -25, -10]);
	expect(result.purchases.map(p => p.totalAmount)).toEqual([100, -25, -10]);
});

for (const fixture of [
	{
		cashback: -0.27,
		count: 24,
		dueDate: "2025-12-25",
		file: "picpay-2025-12.txt",
		financedCount: 8,
		installment: 2,
		iof: "0,03",
		statementDate: "2025-12-18",
		totalCents: 32427,
	},
	{
		cashback: -2.03,
		count: 17,
		dueDate: "2026-02-25",
		file: "picpay-2026-02.txt",
		financedCount: 6,
		installment: 4,
		iof: "0,06",
		statementDate: "2026-02-19",
		totalCents: 24412,
	},
]) {
	test(`parses the extracted ${fixture.file} layout and reconciles its invoice total`, async () => {
		const text = await Bun.file(new URL(`./tests/fixtures/${fixture.file}`, import.meta.url)).text();
		const statement = parsePicPayCreditCardStatementText(text);
		expect(statement).toMatchObject({
			dueDate: fixture.dueDate,
			provider: "PICPAY",
			statementDate: fixture.statementDate,
		});
		expect(statement.purchases).toHaveLength(fixture.count);
		expect(
			statement.purchases.reduce((sum, purchase) => sum + Math.round(purchase.installmentAmount * 100), 0),
		).toBe(fixture.totalCents);
		expect(statement.purchases.find(purchase => purchase.description.includes("CASHBACK"))).toMatchObject({
			description: "Reembolso - CASHBACK PICPAY CARD",
			installmentAmount: fixture.cashback,
			totalAmount: fixture.cashback,
		});
		expect(
			statement.purchases.some(purchase => /PAGAMENTO DE FATURA|^IOF /u.test(purchase.description)),
		).toBe(false);
		expect(statement.purchases.filter(purchase => purchase.description.startsWith("FIN "))).toHaveLength(
			fixture.financedCount,
		);
		expect(statement.purchases[0]).toMatchObject({
			currentInstallment: fixture.installment,
			description: `FIN CINEPOLIS · IOF R$ ${fixture.iof}`,
			installmentAmount: 10.34,
			installments: 16,
			purchaseDate: "2025-11-09",
		});
		expect(statement.purchases.find(purchase => purchase.description === "AMAZON MARKETP")).toMatchObject({
			currentInstallment: fixture.installment,
			installmentAmount: 16.59,
			installments: 12,
			purchaseDate: "2025-10-30",
		});
	});
}
