import { describe, expect, test } from "bun:test";
import { parseMercadoPagoStatementText } from "./mercado-pago";

describe("parseMercadoPagoStatementText", () => {
	test("normaliza linhas quebradas, IDs e valores brasileiros", () => {
		const statement = parseMercadoPagoStatementText(`
EXTRATO DE CONTA
De 01-08-2026 al 31-08-2026 Periodo:
DETALHE DOS MOVIMENTOS
Data Descrição ID da operação Valor Saldo
03-08-2026 Pix recebido Aran Leite de
Gusmão 170962950849 R$ 300,00 R$ 305,79
04-08-2026 Dinheiro reservado Psicóloga 171864468626 R$ -287,52 R$ 18,27
`);

		expect(statement.periodStart).toBe("2026-08-01");
		expect(statement.periodEnd).toBe("2026-08-31");
		expect(statement.transactions).toEqual([
			{
				amount: 300,
				balanceAfter: 305.79,
				date: "2026-08-03",
				description: "Pix recebido Aran Leite de Gusmão",
				externalId: "170962950849",
				type: "INCOME",
			},
			{
				amount: 287.52,
				balanceAfter: 18.27,
				date: "2026-08-04",
				description: "Dinheiro reservado Psicóloga",
				externalId: "171864468626",
				type: "EXPENSE",
			},
		]);
	});

	test("classifica rendimentos sem diferenciar maiúsculas e minúsculas", () => {
		const statement = parseMercadoPagoStatementText(`
EXTRATO DE CONTA
Data Descrição ID da operação Valor Saldo
08-09-2026 RENDIMENTO 1749595240378 R$ 0,49 R$ 18,76
`);

		expect(statement.transactions[0]).toMatchObject({ description: "RENDIMENTO", type: "YIELD" });
	});

	test("descarta rodapés de paginação entre movimentações", () => {
		const statement = parseMercadoPagoStatementText(`
EXTRATO DE CONTA
Data Descrição ID da operação Valor Saldo
20-09-2026 Dinheiro reservado Faturas 180016995316 R$ -758,52 R$ 3.884,14
3/4
20-09-2026 Dinheiro reservado Faturas 180017422920 R$ -98,11 R$ 3.786,03
`);

		expect(statement.transactions).toEqual([
			{
				amount: 758.52,
				balanceAfter: 3884.14,
				date: "2026-09-20",
				description: "Dinheiro reservado Faturas",
				externalId: "180016995316",
				type: "EXPENSE",
			},
			{
				amount: 98.11,
				balanceAfter: 3786.03,
				date: "2026-09-20",
				description: "Dinheiro reservado Faturas",
				externalId: "180017422920",
				type: "EXPENSE",
			},
		]);
	});
});
