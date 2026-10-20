import { expect, test } from "bun:test";
import { parseCreditCardStatementText } from "./credit-card-statement-parser";

test("dispatches the classic Bradesco layout and preserves previous balance", () => {
	const statement = parseCreditCardStatementText(
		`
Fatura mensal
Total da fatura R$ 10,00 Vencimento 25/08/2026
Saldo anterior: R$ 9,00
Nacionais em Reais (R$)
01/08 LOJA SAO PAULO 10,00
Total parcelado para as próximas faturas R$ 0,00
`,
		"BRADESCO",
	);
	expect(statement.reportedPreviousBalance).toBe(9);
	expect(statement.purchases).toHaveLength(1);
	expect(statement.purchases[0]!.description).toBe("LOJA SAO PAULO");
});

test("rejects unrecognized and conflicting Bradesco signatures before parsing", () => {
	expect(() => parseCreditCardStatementText("Fatura desconhecida", "BRADESCO")).toThrow(
		"Layout de fatura não reconhecido",
	);
	expect(() =>
		parseCreditCardStatementText(
			"Nacionais em Reais\nMovimentações da conta\nTotal parcelado para as próximas faturas",
			"BRADESCO",
		),
	).toThrow("um único layout");
});

test("rejects empty extracted text", () => {
	expect(() => parseCreditCardStatementText(" \n", "BRADESCO")).toThrow(
		"Não foi possível extrair texto do PDF",
	);
});
