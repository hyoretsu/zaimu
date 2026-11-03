import { expect, test } from "bun:test";
import { parseBancoPanStatementText } from "./banco-pan";

const header =
	"Olá, ARAN!\nEsse é o extrato\nda sua conta Pan.\nPeríodo do extrato:\n01/01 a 31/03\nExtrato de 01/01/2025 a 31/03/2025\nSuas movimentações:\n";

test("Banco PAN lê o texto extraído do PDF", () => {
	const statement = parseBancoPanStatementText(
		`${header}20/03 931229533\nDEBITO\nR$ 0,00\tPG FATURA CARTÃO PAN R$ 84,61\t-\n19/03 928507146\nCREDITO PIX\nR$ 84,61\tPIX RECEBIDO \tR$ 84,61\t+\nPágina 2 de 3\n`,
	);
	expect(statement).toEqual({
		periodEnd: "2025-03-31",
		periodStart: "2025-01-01",
		provider: "BANCO_PAN",
		transactions: [
			{ amount: 84.61, date: "2025-03-20", description: "PG FATURA CARTÃO PAN", type: "EXPENSE" },
			{ amount: 84.61, date: "2025-03-19", description: "PIX RECEBIDO", type: "INCOME" },
		],
	});
});

test("Banco PAN lê a ordem visual e períodos que viram o ano", () => {
	const statement = parseBancoPanStatementText(
		`${header.replace("01/01/2025 a 31/03/2025", "01/11/2025 a 31/01/2026")}15/12 1\nDEBITO\nPG FATURA CARTÃO PAN - R$ 10,00 R$ 0,00\n05/01 2\nCREDITO PIX\nPIX RECEBIDO + R$ 1.010,50 R$ 1.010,50\n`,
	);
	expect(statement.transactions.map(({ amount, date, type }) => [amount, date, type])).toEqual([
		[10, "2025-12-15", "EXPENSE"],
		[1010.5, "2026-01-05", "INCOME"],
	]);
});

test("Banco PAN rejeita extrato sem movimentações", () => {
	expect(() => parseBancoPanStatementText(header)).toThrow("Nenhuma movimentação");
});
