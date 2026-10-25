import { expect, test } from "bun:test";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { combineAnticipationRefunds } from "../domain/anticipation-refunds";
import { parseBradescardCreditCardStatementText } from "../domain/bradescard-credit-card";
import { parseBradescoCreditCardStatementText } from "../domain/bradesco-credit-card";
import { parseInterCreditCardStatementText } from "../domain/inter-credit-card";
import { parseMercadoPagoCreditCardStatementText } from "../domain/mercado-pago-credit-card";
import { parseNubankCreditCardStatementText } from "../domain/nubank-credit-card";
import { parsePicPayCreditCardStatementText } from "../domain/picpay-credit-card";
import { parseWillBankCreditCardStatementText } from "../domain/will-bank-credit-card";

const layouts = [
	{
		credit: "04/09 Crédito concedido 249,00",
		footer: "Total parcelado para as próximas faturas",
		header: "Vencimento 21/09/2026\nNacionais em Reais (R$)",
		name: "Bradesco",
		parse: parseBradescoCreditCardStatementText,
		part: (n: number) => `08/08 LOJA(${String(n).padStart(2, "0")}/08) 31,12`,
		payment: "20/08 Débito automático da fatura de agosto/2026 247,06",
	},
	{
		credit: "04/09 Crédito concedido 249,00",
		footer: "Total de compras",
		header: "Vencimento 21/09/2026\nMovimentações da conta\nNacionais em Reais (R$)",
		name: "Bradescard",
		parse: parseBradescardCreditCardStatementText,
		part: (n: number) => `08/08 LOJA(${String(n).padStart(2, "0")}/08) 31,12`,
		payment: "20/08 Débito automático da fatura de agosto/2026 247,06",
	},
	{
		credit: "04 de set. 2026 Crédito concedido - R$ 249,00",
		footer: "Próxima fatura",
		header: "Data de Vencimento 21/09/2026\nDespesas da fatura",
		name: "Inter",
		parse: parseInterCreditCardStatementText,
		part: (n: number) => `08 de ago. 2026 LOJA (Parcela ${n} de 8) - R$ 31,12`,
		payment: "20 de ago. 2026 Débito automático da fatura de agosto/2026 - R$ 247,06",
	},
	{
		credit: "04/09 Crédito concedido R$ 249,00",
		footer: "Parcele a fatura",
		header: "Vence em 21/09/2026\nFechamento da fatura 15/09/2026\nMovimentações na fatura\nCartão Visa",
		name: "Mercado Pago",
		parse: parseMercadoPagoCreditCardStatementText,
		part: (n: number) => `08/08 LOJA Parcela ${n} de 8 R$ 31,12`,
		payment: "20/08 Débito automático da fatura de agosto/2026 R$ 247,06",
	},
	{
		credit: "04 SET Crédito concedido R$ 249,00",
		footer: "",
		header:
			"Data de vencimento: 21 SET 2026\nPeríodo vigente: 15 AGO a 15 SET\nTRANSAÇÕES DE 15 AGO A 15 SET",
		name: "Nubank",
		parse: parseNubankCreditCardStatementText,
		part: (n: number) => `08 AGO LOJA - Parcela ${n}/8 R$ 31,12`,
		payment: "20 AGO Débito automático da fatura de agosto/2026 R$ 247,06",
	},
	{
		credit: "04/09 Crédito concedido 249,00",
		footer: "Subtotal dos lançamentos",
		header: "21/09/2026 | 15/09/2026 Vencimento: Fechamento:\nTransações Nacionais",
		name: "PicPay",
		parse: parsePicPayCreditCardStatementText,
		part: (n: number) => `08/08 LOJAPARC${n}/8 31,12`,
		payment: "20/08 Débito automático da fatura de agosto/2026 247,06",
	},
	{
		credit: "04/09 Crédito concedido Virtual R$ 249,00",
		footer: "",
		header: "Detalhamento da fatura de\nCartão Mastercard\nVencimento 21/09/2026",
		name: "Will legacy",
		parse: parseWillBankCreditCardStatementText,
		part: (n: number) => `08/08 LOJA ${n}/8 Virtual R$ 31,12`,
		payment: "20/08 Débito automático da fatura de agosto/2026 Virtual R$ 247,06",
	},
	{
		credit: "Crédito concedido 04/09/2026 Cartão 1620 R$ 249,00",
		footer: "",
		header: "Lançamentos de\nConfira seus gastos e os valores recebidos\nVencimento 21/09/2026",
		name: "Will current",
		parse: parseWillBankCreditCardStatementText,
		part: (n: number) => `LOJA ${n}/8 08/08/2026 Cartão 1620 R$ 31,12`,
		payment: "Débito automático da fatura de agosto/2026 20/08/2026 Cartão 1620 R$ 247,06",
	},
];
for (const layout of layouts)
	test(`${layout.name}: generic credit collapses exact tail and invoice payments never become purchases`, () => {
		const text = [
			layout.header,
			...Array.from({ length: 7 }, (_, i) => layout.part(i + 2)),
			layout.credit,
			layout.payment,
			layout.payment.replace("247,06", "114,12"),
			layout.footer,
		].join("\n");
		const parsed = layout.parse(text);
		expect(parsed.purchases).toHaveLength(2);
		const rows = combineAnticipationRefunds(parsed.purchases, [
			{
				id: "original",
				installmentAmountsCents: [3116, ...Array(7).fill(3112)],
				purchaseDate: layout.name === "Nubank" ? "2026-07-08" : "2026-08-08",
				totalAmount: 249,
			},
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			installmentAmount: -249,
			purchaseDate: "2026-09-04",
			reconciledCreditPurchaseId: "original",
		});
		expect(importedAnticipation(rows[0]!.description)).toEqual(
			Array.from({ length: 7 }, (_, i) => ({ amountCents: 3112, number: i + 2 })),
		);
	});

for (const layout of layouts)
	for (const [value, isRefund] of [
		["217,83", false],
		["217,84", true],
		["249,00", true],
	] as const)
		test(`${layout.name}: credit ${value} distinguishes discount from refund after parsing`, () => {
			const parsed = layout.parse(
				[
					layout.header,
					...Array.from({ length: 7 }, (_, i) => layout.part(i + 2)),
					layout.credit.replace("249,00", value),
					layout.footer,
				].join("\n"),
			);
			const rows = combineAnticipationRefunds(parsed.purchases);
			expect(rows).toHaveLength(isRefund ? 1 : 2);
			const refund = rows.find(row => row.installmentAmount < 0)!;
			expect(importedAnticipation(refund.description)?.length ?? 0).toBe(isRefund ? 7 : 0);
			expect(rows.some(row => row.installmentAmount > 0 && importedAnticipation(row.description))).toBe(
				!isRefund,
			);
		});
