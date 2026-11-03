import { describe, expect, test } from "bun:test";
import { parseBtgPactualStatementText } from "./btg-pactual";

describe("parseBtgPactualStatementText", () => {
	test("lê lançamentos com data e hora e ignora o saldo diário", () => {
		const statement = parseBtgPactualStatementText(`
Período do extrato:
01/01/2026 a 22/09/2026
Data e hora Categoria Transação Descrição Valor
10/06/2026 11h15 Transferência Pix recebido Aran Leite De Gusmao R$ 210,02
10/06/2026 23h07 Transferência Pix enviado Aran Leite De Gusmao -R$ 210,02
10/06/2026 23h59 Saldo Diário R$ 0,00
10/07/2026 23h39 Outra Categoria Pix recebido J B Marketing Digital R$ 3.000,00
10/07/2026 23h49 Transferência Pix enviado Aran Leite De Gusmao -R$ 1.000,00
10/07/2026 23h59 Saldo Diário R$ 2.000,00
`);
		expect(statement).toEqual({
			periodEnd: "2026-09-22",
			periodStart: "2026-01-01",
			provider: "BTG_PACTUAL",
			transactions: [
				{
					amount: 210.02,
					date: "2026-06-10",
					description: "Pix recebido Aran Leite De Gusmao",
					time: "11:15",
					type: "INCOME",
				},
				{
					amount: 210.02,
					date: "2026-06-10",
					description: "Pix enviado Aran Leite De Gusmao",
					time: "23:07",
					type: "EXPENSE",
				},
				{
					amount: 3000,
					date: "2026-07-10",
					description: "Pix recebido J B Marketing Digital",
					time: "23:39",
					type: "INCOME",
				},
				{
					amount: 1000,
					date: "2026-07-10",
					description: "Pix enviado Aran Leite De Gusmao",
					time: "23:49",
					type: "EXPENSE",
				},
			],
		});
	});
});
