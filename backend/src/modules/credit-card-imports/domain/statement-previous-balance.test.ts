import { expect, test } from "bun:test";
import { statementPreviousBalance } from "./statement-previous-balance";

test("extracts only explicit bank principal summaries, including zero and credit", () => {
	expect(statementPreviousBalance("Resumo\nSaldo anterior: R$ 1.234,56\nTotal da fatura R$ 1.300,00")).toBe(
		1234.56,
	);
	expect(statementPreviousBalance("Saldo devedor anterior\nR$ 0,00")).toBe(0);
	expect(statementPreviousBalance("Saldo financiado R$ -30,00")).toBe(-30);
	expect(
		statementPreviousBalance("Total da fatura R$ 90,00\n20 AGO Loja Saldo anterior R$ 90,00"),
	).toBeUndefined();
});
