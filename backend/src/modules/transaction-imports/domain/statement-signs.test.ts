import { describe, expect, test } from "bun:test";
import { parseBancoDoBrasilStatementText } from "./banco-do-brasil";
import { parseInterStatementText } from "./inter";
import { parseMercadoPagoStatementText } from "./mercado-pago";
import { parseNubankStatementText } from "./nubank";
import { parsePicPayStatementText } from "./picpay";

for (const debit of ["-R$ 71,40", "R$ -71,40", "−R$ 71,40", "R$ −71,40"]) {
	describe(`sinal monetário ${debit}`, () => {
		const readers = [
			{
				name: "Inter",
				parse: parseInterStatementText,
				text: `Instituição: Banco Inter
Período: 01/06/2026 a 30/06/2026
1 de Junho de 2026 Saldo do dia: R$ 0,00
Pix enviado: Pessoa ${debit} ${debit}
Pix recebido: Empresa +R$ 71,40 R$ 0,00`,
			},
			{
				name: "Mercado Pago",
				parse: parseMercadoPagoStatementText,
				text: `EXTRATO DE CONTA
Data Descrição ID da operação Valor Saldo
01-06-2026 Pix enviado Pessoa 12345678 ${debit} ${debit}
01-06-2026 Pix recebido Empresa 12345679 +R$ 71,40 R$ 0,00`,
			},
			{
				name: "PicPay",
				parse: parsePicPayStatementText,
				text: `PicPay Serviços S/A
Extrato de conta
1 de junho 2026 Saldo ao final do dia: R$ 0,00
10:00 Pix enviado ${debit}\tPessoa
10:01 Pix recebido +R$ 71,40\tEmpresa`,
			},
		];
		for (const reader of readers) {
			test(`${reader.name} mantém movimentos separados e sinal fora da descrição`, () => {
				const { transactions } = reader.parse(reader.text);
				expect(transactions).toHaveLength(2);
				expect(transactions[0]).toMatchObject({
					amount: 71.4,
					date: "2026-06-01",
					description: reader.name === "Inter" ? "Pix enviado: Pessoa" : "Pix enviado Pessoa",
					type: "EXPENSE",
				});
				expect(transactions[1]).toMatchObject({
					amount: 71.4,
					date: "2026-06-01",
					description: reader.name === "Inter" ? "Pix recebido: Empresa" : "Pix recebido Empresa",
					type: "INCOME",
				});
				if (reader.name !== "PicPay") {
					expect(transactions.map(t => t.balanceAfter)).toEqual([-71.4, 0]);
				}
			});
		}
	});
}

for (const minus of ["-", "−"]) {
	for (const extracted of [false, true]) {
		test(`Banco do Brasil preserva débito ${minus} na ordem ${extracted ? "extraída" : "visual"}`, () => {
			const rows = extracted
				? `01/06/2026 71,40 (${minus}) 3165 12345678 Pix enviado Pessoa\n01/06/2026 71,40 (+) 3165 12345679 Pix recebido Empresa`
				: `01/06/2026 3165 12345678 Pix enviado Pessoa 71,40 (${minus})\n01/06/2026 3165 12345679 Pix recebido Empresa 71,40 (+)`;
			const { transactions } = parseBancoDoBrasilStatementText(
				`Extrato de Conta Corrente\nLançamentos\n${rows}`,
			);
			expect(
				transactions.map(({ amount, type, description }) => ({ amount, description, type })),
			).toEqual([
				{ amount: 71.4, description: "Pix enviado Pessoa", type: "EXPENSE" },
				{ amount: 71.4, description: "Pix recebido Empresa", type: "INCOME" },
			]);
		});
	}
	test(`Nubank preserva seção de saídas com sinal ${minus}`, () => {
		const { transactions } = parseNubankStatementText(`Movimentações
01 DE JUNHO DE 2026 a 30 DE JUNHO DE 2026
01 JUN 2026 Total de saídas ${minus} 71,40
Pix enviado Pessoa
71,40
Total de entradas + 71,40
Pix recebido Empresa
71,40`);
		expect(transactions.map(({ amount, type, description }) => ({ amount, description, type }))).toEqual([
			{ amount: 71.4, description: "Pix enviado Pessoa", type: "EXPENSE" },
			{ amount: 71.4, description: "Pix recebido Empresa", type: "INCOME" },
		]);
	});
}
