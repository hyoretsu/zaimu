import { expect, test } from "bun:test";
import { nextStatementDateFromText, parseCreditCardStatementText } from "./credit-card-statement-parser";

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

test("Amazon May exposes the next closing without inventing the current closing", () => {
	const result = parseCreditCardStatementText(
		`Fatura mensal
 Vencimento 25/05/2026
 A previsão de fechamento da sua próxima fatura é dia 12/06/2026
 Nacionais em Reais (R$)
30/04 AMAZON BR SAO PAULO(01/08) 22,03
 Total parcelado para as próximas faturas R$ 293,01`,
		"BRADESCO",
	);
	expect(result.statementDate).toBeUndefined();
	expect(result.dueDate).toBe("2026-05-25");
	expect(result.nextStatementDate).toBe("2026-06-12");
});

test("next-cycle extraction covers classic, legacy and Inter wording", () => {
	for (const text of [
		"A previsão de fechamento da sua próxima fatura é dia 12/06/2026",
		"Previsão para fechamento da próxima fatura é dia 12/06/2026",
		"Próxima fatura\nData de corte: 12/06/2026",
		"Próxima fatura\nFechamento: 12-06-2026",
	])
		expect(nextStatementDateFromText(text)).toBe("2026-06-12");
	expect(nextStatementDateFromText("Fechamento: 12/05/2026 Vencimento 25/05/2026")).toBeUndefined();
	expect(() => nextStatementDateFromText("Fechamento da próxima fatura 31/06/2026")).toThrow("inválida");
	expect(() =>
		nextStatementDateFromText(
			"Fechamento da próxima fatura 12/06/2026\nFechamento da próxima fatura 13/06/2026",
		),
	).toThrow("conflitantes");
});

for (const provider of ["BRADESCO", "INTER", "MERCADO_PAGO", "NUBANK", "PICPAY", "WILL_BANK"] as const) {
	test(`invalid ${provider} invoice explains how to correct the selection`, () => {
		expect(() => parseCreditCardStatementText("Arquivo de outra instituição", provider)).toThrow(
			"Verifique se o banco escolhido corresponde ao arquivo enviado",
		);
	});
}

test("Inter invoice selected as Mercado Pago explains the selection instead of only missing dates", () => {
	expect(() =>
		parseCreditCardStatementText(
			`Data de Vencimento 20/08/2026
DATA DOCUMENTO 10/08/2026
Despesas da fatura
01 de ago 2026 LOJA - R$ 10,00`,
			"MERCADO_PAGO",
		),
	).toThrow("selecione o banco ou a fatura correta");
});

for (const signature of [
	"Nacionais em Reais\nTotal parcelado para as próximas faturas",
	"Movimentações da conta\nNacionais em Reais",
]) {
	test(`invalid Bradesco layout retains selection guidance: ${signature}`, () => {
		expect(() => parseCreditCardStatementText(signature, "BRADESCO")).toThrow(
			"Verifique se o banco escolhido corresponde ao arquivo enviado",
		);
	});
}
