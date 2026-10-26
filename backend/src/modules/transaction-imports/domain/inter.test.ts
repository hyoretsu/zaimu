import { describe, expect, test } from "bun:test";
import { parseInterStatementText } from "./inter";

describe("parseInterStatementText", () => {
	test("lê entradas, saídas e saldo por transação", () => {
		const statement = parseInterStatementText(`
CPF/CNPJ: 000.000.000-00, Instituição: Banco Inter, Agência: 0001-9, Conta: 12345678-9
Período: 01/07/2026 a 30/07/2026
Valor \tSaldo por transação\t19 de Julho de 2026 Saldo do dia: R$ 312,52
Pix recebido: "Pessoa" \tR$ 312,52 \tR$ 312,52
22 de Julho de 2026 Saldo do dia: R$ 0,00
Pagamento efetuado: "Pagamento fatura cartao Inter" \t-R$ 312,52 \tR$ 0,00
Fale com a gente
`);

		expect(statement).toEqual({
			periodEnd: "2026-07-30",
			periodStart: "2026-07-01",
			provider: "INTER",
			transactions: [
				{
					amount: 312.52,
					balanceAfter: 312.52,
					date: "2026-07-19",
					description: 'Pix recebido: "Pessoa"',
					type: "INCOME",
				},
				{
					amount: 312.52,
					balanceAfter: 0,
					date: "2026-07-22",
					description: 'Pagamento efetuado: "Pagamento fatura cartao Inter"',
					type: "EXPENSE",
				},
			],
		});
	});
});

describe("saldos negativos por transação", () => {
	for (const balance of ["-R$ 71,40", "R$ -71,40"]) {
		test(`preserva saída e entrada separadas com saldo ${balance}`, () => {
			const statement = parseInterStatementText(`
Instituição: Banco Inter
Período: 01/01/2026 a 22/09/2026
1 de Junho de 2026 Saldo do dia: R$ 0,00
Pix enviado: "Pessoa" -R$ 71,40 ${balance}
Pix recebido: "Empresa" R$ 71,40 R$ 0,00
Fale com a gente
SAC: 0800 000 0000
-- 2 of 3 --
3 de Junho de 2026 Saldo do dia: R$ 0,00
Pix enviado: "Pessoa" -R$ 60,00 -R$ 60,00
Pix recebido: "Outra empresa" R$ 60,00 R$ 0,00
19 de Julho de 2026 Saldo do dia: R$ 312,52
Pix recebido: "Pessoa" R$ 312,52 R$ 312,52
22 de Julho de 2026 Saldo do dia: R$ 0,00
Pagamento efetuado: "Pagamento fatura cartao Inter" -R$ 312,52 R$ 0,00
`);
			expect(statement.transactions).toEqual([
				{
					amount: 71.4,
					balanceAfter: -71.4,
					date: "2026-06-01",
					description: 'Pix enviado: "Pessoa"',
					type: "EXPENSE",
				},
				{
					amount: 71.4,
					balanceAfter: 0,
					date: "2026-06-01",
					description: 'Pix recebido: "Empresa"',
					type: "INCOME",
				},
				{
					amount: 60,
					balanceAfter: -60,
					date: "2026-06-03",
					description: 'Pix enviado: "Pessoa"',
					type: "EXPENSE",
				},
				{
					amount: 60,
					balanceAfter: 0,
					date: "2026-06-03",
					description: 'Pix recebido: "Outra empresa"',
					type: "INCOME",
				},
				{
					amount: 312.52,
					balanceAfter: 312.52,
					date: "2026-07-19",
					description: 'Pix recebido: "Pessoa"',
					type: "INCOME",
				},
				{
					amount: 312.52,
					balanceAfter: 0,
					date: "2026-07-22",
					description: 'Pagamento efetuado: "Pagamento fatura cartao Inter"',
					type: "EXPENSE",
				},
			]);
		});
	}
});
