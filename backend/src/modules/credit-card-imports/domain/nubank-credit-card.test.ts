import { describe, expect, test } from "bun:test";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { parseCreditCardStatementText } from "./credit-card-statement-parser";
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

for (const fixture of [
	{
		cents: 207174,
		dueDate: "2024-05-08",
		file: "2024-05",
		nextStatementDate: "2024-06-01",
		statementDate: "2024-05-01",
	},
	{
		cents: 82191,
		dueDate: "2024-09-09",
		file: "2024-09",
		nextStatementDate: "2024-10-01",
		statementDate: "2024-09-01",
	},
	{
		cents: 27128,
		dueDate: "2022-02-08",
		file: "2022-02",
		nextStatementDate: undefined,
		statementDate: "2022-02-01",
	},
]) {
	test(`reads historical Nubank ${fixture.file} without dropping rows or inventing amounts`, async () => {
		const text = await Bun.file(
			new URL(`./tests/fixtures/nubank-${fixture.file}.txt`, import.meta.url),
		).text();
		const result = parseCreditCardStatementText(text, "NUBANK");
		expect(result).toMatchObject({
			dueDate: fixture.dueDate,
			nextStatementDate: fixture.nextStatementDate,
			statementDate: fixture.statementDate,
		});
		// Source line totals differ slightly from printed invoice summaries; preserve actual rows.
		expect(
			result.purchases.reduce(
				(sum, p) =>
					sum +
					(importedAnticipation(p.description)?.reduce((total, part) => total + part.amountCents, 0) ??
						Math.round(p.installmentAmount * 100)),
				0,
			),
		).toBe(fixture.cents);
		expect(result.purchases.some(p => /^Pagamento|Total a pagar|Conversão:/iu.test(p.description))).toBe(
			false,
		);
		expect(
			result.purchases
				.filter(p => /^Estorno|^Desconto/iu.test(p.description))
				.every(p => p.installmentAmount < 0),
		).toBe(true);
		expect(
			result.purchases.filter(p => /^Reversão/iu.test(p.description)).every(p => p.installmentAmount > 0),
		).toBe(true);
		if (fixture.file === "2024-09") {
			expect(result.purchases.find(p => p.description === 'IOF de "Spred"')?.installmentAmount).toBe(2.57);
			expect(result.purchases.find(p => p.description === "Spred")?.installmentAmount).toBe(58.89);
			expect(
				result.purchases.find(
					p => p.description === "Saldo adicionado na sua conta do Nubank" && p.currentInstallment === 3,
				),
			).toMatchObject({ installmentAmount: 98.5, installments: 5 });
		}
		for (const p of result.purchases) {
			const parts = importedAnticipation(p.description);
			if (parts) expect(new Set(parts.map(part => part.amountCents)).size).toBe(1);
		}
	});
}

test("keeps December closing in the previous year for January invoices", () => {
	const result = parseNubankCreditCardStatementText(
		"VENCIMENTO 08 JAN 2024\nTotal de compras, 01 NOV a 31 DEZ\nTRANSAÇÕES DE 01 NOV A 31 DEZ\n30 DEZ LOJA 10,00",
	);
	expect(result.statementDate).toBe("2023-12-31");
	expect(result.purchases[0]?.purchaseDate).toBe("2023-12-30");
});
