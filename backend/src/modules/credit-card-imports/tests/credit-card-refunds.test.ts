import { describe, expect, test } from "bun:test";
import { calculateRefundEffects, matchingGenericRefundSource } from "@zaimu/finance/credit-refund";
import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { combineAnticipationRefunds } from "../domain/anticipation-refunds";
import { parseBradescardCreditCardStatementText } from "../domain/bradescard-credit-card";
import { parseBradescoCreditCardStatementText } from "../domain/bradesco-credit-card";
import { assignCreditCardPurchaseExternalIds } from "../domain/credit-card-import-identity";
import { parseInterCreditCardStatementText } from "../domain/inter-credit-card";
import { parseMercadoPagoCreditCardStatementText } from "../domain/mercado-pago-credit-card";
import { parseNubankCreditCardStatementText } from "../domain/nubank-credit-card";
import { parsePicPayCreditCardStatementText } from "../domain/picpay-credit-card";
import { selectNewImportPurchases } from "../domain/select-new-import-purchases";

const providers = [
	{
		name: "Bradescard",
		parse: parseBradescardCreditCardStatementText,
		text: `Vencimento 25/05/2026
Movimentações da conta
Nacionais em Reais (R$)
30/04 AMAZON BR SAO PAULO 176,03
30/04 AMAZON BR SAO PAULO 176,03 -
10/05 PAGAMENTO RECEBIDO - OBRIGADO 176,03 -
Total de compras`,
	},
	{
		name: "Bradesco",
		parse: parseBradescoCreditCardStatementText,
		text: `Vencimento 25/05/2026
Nacionais em Reais (R$)
30/04 AMAZON BR SAO PAULO 176,03
30/04 AMAZON BR SAO PAULO 176,03 -
10/05 PAGAMENTO RECEBIDO - OBRIGADO 176,03 -
Total parcelado para as próximas faturas`,
	},
	{
		name: "Inter",
		parse: parseInterCreditCardStatementText,
		text: `Data de Vencimento 25/05/2026
Despesas da fatura
30 de abr. 2026 AMAZON BR SAO PAULO - R$ 176,03
30 de abr. 2026 AMAZON BR SAO PAULO - + R$ 176,03
10 de mai. 2026 PAGAMENTO ON LINE - + R$ 176,03
Próxima fatura`,
	},
	{
		name: "Mercado Pago",
		parse: parseMercadoPagoCreditCardStatementText,
		text: `Vence em 25/05/2026
Fechamento da fatura 15/05/2026
Cartão Visa
30/04 AMAZON BR SAO PAULO R$ 176,03
30/04 AMAZON BR SAO PAULO -R$ 176,03
10/05 PAGAMENTO R$ 176,03
Parcele a fatura`,
	},
	{
		name: "Nubank",
		parse: parseNubankCreditCardStatementText,
		text: `Data de vencimento: 25 MAI 2026
Período vigente: 15 ABR a 15 MAI
TRANSAÇÕES DE 15 ABR A 15 MAI
30 ABR AMAZON BR SAO PAULO R$ 176,03
30 ABR AMAZON BR SAO PAULO -R$ 176,03
10 MAI Pagamento -R$ 176,03`,
	},
	{
		name: "PicPay",
		parse: parsePicPayCreditCardStatementText,
		text: `25/05/2026 | 15/05/2026 Vencimento: Fechamento:
Transações Nacionais
30/04 AMAZON BR SAO PAULO 176,03
30/04 AMAZON BR SAO PAULO -176,03
10/05 PAGAMENTO DE FATURA -176,03
Subtotal dos lançamentos`,
	},
];

for (const provider of providers)
	describe(provider.name, () => {
		test("recognizes merchant credit without refund keywords and excludes invoice payments", () => {
			const { purchases } = provider.parse(provider.text);
			expect(purchases).toHaveLength(2);
			expect(purchases[0]).toMatchObject({ installmentAmount: 176.03, totalAmount: 176.03 });
			expect(purchases[1]!.description.replace(/^Reembolso - /u, "")).toBe("AMAZON BR SAO PAULO");
			expect(purchases[1]).toMatchObject({
				installmentAmount: -176.03,
				purchaseDate: "2026-04-30",
				totalAmount: -176.03,
			});
		});
		test("preserves bank signs in every supported amount position", () => {
			const currency = ["Mercado Pago", "Nubank", "Inter"].includes(provider.name);
			const sign = provider.name === "Inter" ? "+" : "-";
			const creditLine = provider.text.split("\n").filter(line => line.includes("AMAZON"))[1]!;
			const prefix = creditLine.slice(0, creditLine.indexOf("AMAZON") + "AMAZON BR SAO PAULO".length);
			const amounts = currency
				? [`${sign} R$ 176,03`, `R$ ${sign}176,03`, `R$ 176,03 ${sign}`]
				: [`${sign}176,03`, `176,03 ${sign}`];
			if (sign === "-") amounts.push(currency ? "R$ 176,03 −" : "176,03 −");
			for (const amount of amounts) {
				const result = provider.parse(
					provider.text.replace(creditLine, `${prefix}${provider.name === "Inter" ? " -" : ""} ${amount}`),
				);
				expect(result.purchases).toHaveLength(2);
				expect(result.purchases[1]).toMatchObject({
					description: provider.name === "PicPay" ? "Reembolso - AMAZON BR SAO PAULO" : "AMAZON BR SAO PAULO",
					installmentAmount: -176.03,
					totalAmount: -176.03,
				});
			}
		});
		if (["Bradesco", "Bradescard"].includes(provider.name))
			test("retains dated merchant credits while excluding credit summaries", () => {
				const text = provider.text.replace(
					"30/04 AMAZON BR SAO PAULO 176,03 -",
					"30/04 Crédito AMAZON BR SAO PAULO 176,03 -\n30/04 Créditos 176,03 -",
				);
				const { purchases } = provider.parse(text);
				expect(purchases).toHaveLength(2);
				expect(purchases[1]).toMatchObject({
					description: "Crédito AMAZON BR SAO PAULO",
					installmentAmount: -176.03,
				});
			});
		test("identifies generic refunds and suggests only a unique purchase before the credit", () => {
			const text = provider.text.replaceAll("AMAZON BR SAO PAULO", "Crédito concedido");
			const { purchases } = provider.parse(text);
			expect(purchases).toHaveLength(2);
			for (const credit of purchases) {
				expect(credit.installmentAmount).toBe(-176.03);
				const original = {
					id: "before",
					purchaseDate: "2026-04-29",
					refundableAmount: 176.03,
					totalAmount: 176.03,
				};
				const future = { ...original, id: "after", purchaseDate: "2026-05-01" };
				expect(matchingGenericRefundSource(credit, [original, future])?.id).toBe("before");
				expect(matchingGenericRefundSource(credit, [original, { ...original, id: "other" }])).toBeUndefined();
			}
		});
		test("collapses anticipation and offsetting credit before duplicate filtering", () => {
			const formats: Record<string, [string, string, string]> = {
				Bradesco: [
					"30/04 AMAZON BR SAO PAULO 176,03",
					"30/04 AMAZON BR SAO PAULO(01/03) 50,00\n30/04 AMAZON BR SAO PAULO(02/03) 50,00",
					"30/04 AMAZON BR SAO PAULO 176,03 -",
				],
				Inter: [
					"30 de abr. 2026 AMAZON BR SAO PAULO - R$ 176,03",
					"30 de abr. 2026 AMAZON BR SAO PAULO (Parcela 1 de 3) - R$ 50,00\n30 de abr. 2026 AMAZON BR SAO PAULO (Parcela 2 de 3) - R$ 50,00",
					"30 de abr. 2026 AMAZON BR SAO PAULO - + R$ 176,03",
				],
				"Mercado Pago": [
					"30/04 AMAZON BR SAO PAULO R$ 176,03",
					"30/04 AMAZON BR SAO PAULO Parcela 1 de 3 R$ 50,00\n30/04 AMAZON BR SAO PAULO Parcela 2 de 3 R$ 50,00",
					"30/04 AMAZON BR SAO PAULO -R$ 176,03",
				],
				Nubank: [
					"30 ABR AMAZON BR SAO PAULO R$ 176,03",
					"30 ABR AMAZON BR SAO PAULO - Parcela 1/3 R$ 50,00\n30 ABR AMAZON BR SAO PAULO - Parcela 2/3 R$ 50,00",
					"30 ABR AMAZON BR SAO PAULO -R$ 176,03",
				],
				PicPay: [
					"30/04 AMAZON BR SAO PAULO 176,03",
					"30/04 AMAZON BR SAO PAULOPARC1/3 50,00\n30/04 AMAZON BR SAO PAULOPARC2/3 50,00",
					"30/04 AMAZON BR SAO PAULO -176,03",
				],
			};
			const [debit, installments, credit] =
				formats[provider.name === "Bradescard" ? "Bradesco" : provider.name]!;
			const text = provider.text
				.replace(debit, installments)
				.replace(credit, credit.replace("176,03", "100,00"));
			const identified = assignCreditCardPurchaseExternalIds(provider.parse(text).purchases, "card");
			const refund = identified.find(row => row.installmentAmount < 0)!;
			const rows = combineAnticipationRefunds(identified);
			expect(rows).toHaveLength(1);
			expect(
				selectNewImportPurchases(rows, new Map([[refund.externalId, "approved-refund"]]), [], []),
			).toEqual([]);
			expect(selectNewImportPurchases(rows, new Map(), [], [rows[0]!])).toEqual([]);
			expect(rows[0]).toMatchObject({
				externalId: refund.externalId,
				installmentAmount: -100,
				totalAmount: -100,
			});
			expect(importedAnticipation(rows[0]!.description)).toEqual([
				{ amountCents: 5000, number: 1 },
				{ amountCents: 5000, number: 2 },
			]);
		});
	});

test("refund retains the whole bank credit without forcing installment cancellation", () => {
	const anticipation = {
		description: withImportedAnticipation("Amazon", [
			{ amountCents: 5000, number: 2 },
			{ amountCents: 5000, number: 3 },
		]),
		installmentAmount: 50,
		installments: 3,
		purchaseDate: "2026-04-30",
		totalAmount: 150,
	};
	for (const amount of [100, 150]) {
		const [refund] = combineAnticipationRefunds([
			anticipation,
			{ ...anticipation, description: "Amazon", installmentAmount: -amount, totalAmount: -amount },
		]);
		expect(importedAnticipation(refund!.description)).toHaveLength(2);
		const [effect] = calculateRefundEffects(
			{ id: "purchase", totalAmountCents: 15000 },
			[
				{
					amountCents: amount * 100,
					cancellationEligible: false,
					creditDate: "2026-05-10",
					creditStatementId: "may",
					id: "refund",
					policy: "KEEP_INSTALLMENTS",
					purchaseId: "purchase",
				},
			],
			[1, 2, 3].map(number => ({ amountCents: 5000, number, statementId: "may" })),
			[{ id: "may", statementDate: "2026-05-20" }],
		);
		expect(effect).toMatchObject({
			canceledAmountCents: 0,
			canceledInstallmentNumbers: [],
			creditAmountCents: amount * 100,
		});
	}
});
