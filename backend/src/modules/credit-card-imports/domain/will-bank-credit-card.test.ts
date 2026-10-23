import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCreditCardStatementText } from "./credit-card-statement-parser";

for (const layout of ["legacy", "current"] as const) {
	test(`reads Will Bank ${layout} invoice`, () => {
		const text = readFileSync(new URL(`./tests/fixtures/will-bank-${layout}.txt`, import.meta.url), "utf8");
		const result = parseCreditCardStatementText(text, "WILL_BANK");
		expect(result.dueDate).toBe(layout === "legacy" ? "2025-07-25" : "2025-10-25");
		expect(result.statementDate).toBe(layout === "legacy" ? undefined : "2025-10-22");
		if (layout === "legacy") expect(result.nextStatementDate).toBeUndefined();
		else expect(result.nextStatementDate).toBe("2025-11-22");
		expect(result.purchases).toHaveLength(layout === "legacy" ? 14 : 13);
		expect(
			Math.round(result.purchases.reduce((sum, purchase) => sum + purchase.installmentAmount, 0) * 100),
		).toBe(layout === "legacy" ? 23109 : 34153);
		expect(result.purchases[layout === "legacy" ? 1 : 0]).toMatchObject({
			currentInstallment: layout === "legacy" ? 9 : 12,
			description: layout === "legacy" ? "Ec *terabyteshop" : "EC *TERABYTESHOP",
			installments: 12,
			purchaseDate: "2024-10-19",
		});
		expect(result.purchases.some(p => /PAG FATURA/iu.test(p.description))).toBe(false);
		if (layout === "legacy") {
			expect(
				result.purchases.filter(p => p.description === "Pag*steam" && p.installmentAmount === 9.2),
			).toHaveLength(2);
			expect(result.purchases.at(-1)).toMatchObject({
				description: "Amazon br",
				installmentAmount: -58.14,
				purchaseDate: "2025-07-11",
			});
		}
	});
}

test("rejects unknown or ambiguous Will Bank layouts", () => {
	expect(() => parseCreditCardStatementText("Will Bank", "WILL_BANK")).toThrow(
		"Layout de fatura não reconhecido",
	);
	expect(() =>
		parseCreditCardStatementText(
			"Detalhamento da fatura de Cartão Mastercard Lançamentos de Confira seus gastos e os valores recebidos",
			"WILL_BANK",
		),
	).toThrow("um único layout");
});

for (const sign of ["-R$ 10,00", "R$ -10,00", "R$ 10,00-", "−R$ 10,00"]) {
	test(`preserves credit sign ${sign} in both Will layouts`, () => {
		for (const row of [`01/07 LOJA Virtual ${sign}`, `LOJA 01/07/2025 Cartão 1620 ${sign}`]) {
			const result = parseCreditCardStatementText(
				`Detalhamento da fatura de\nCartão Mastercard\nVencimento 25/07/2025\n${row}`,
				"WILL_BANK",
			);
			expect(result.purchases[0]!.installmentAmount).toBe(-10);
			expect(result.purchases[0]!.description).toBe("LOJA");
		}
	});
}
