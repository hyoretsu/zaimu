import { describe, expect, test } from "bun:test";
import { parseCreditCardStatementText } from "./credit-card-statement-parser";
import { normalizeMercadoPagoText } from "./mercado-pago-text";

// PDF.js text from the historical layout. Keep bold-font headers unchanged.
const historical = `Vence em
20/03/2025
Cartão Visa [************0000]
õata êovimentaç*es Valor em $9
2%/0í E4 UíP$OõGTOS Parcela 11 de 1) $9 %),61
2%/0í êPUíP$OõGTOS Parcela 11 de 12 $9 10,66
11/10 Breenêan Parcela 5 de 6 $9 31,3M
16/10 êPUENAX_ Parcela 5 de 12 $9 12,M5
11/11 êE$4AõOLFV$EU$EXOVA+OXE Parcela 5 de ) $9 5,33
Total R$ 587,64
-- 2 of 6 --
Vencimento: 20/03/2025
Cartão Visa [************0000]
1%/01 Loja Parcela 2 de 11 $9 101,%3
2í/01 4ompra internacional em =VN BLONAL 4APFTAL $9 )1,2%
7PK 155J66 à GSõ 1 à $9 6J1) 7PK 1M)0
2í/02 i+ood $9 5,00
Total R$ 587,64
Parcele a fatura
+echamento da fatura 15/03/2025
Prx.imo fechamento 15/0í/2025`;

describe("Mercado Pago PDF layouts", () => {
	test("decodes historical regular-font glyphs without changing bold-font dates or totals", () => {
		const text = normalizeMercadoPagoText(historical);
		expect(text).toContain("Total R$ 587,64");
		expect(normalizeMercadoPagoText(text)).toBe(text);
		const statement = parseCreditCardStatementText(historical, "MERCADO_PAGO");
		expect(statement.statementDate).toBe("2025-03-15");
		expect(statement.dueDate).toBe("2025-03-20");
		expect(statement.nextStatementDate).toBe("2025-04-15");
		expect(
			statement.purchases.map(p => [
				p.description,
				p.installmentAmount,
				p.currentInstallment,
				p.installments,
				p.purchaseDate,
			]),
		).toEqual([
			["EC *4PRODUTOS", 78.61, 11, 18, "2024-04-27"],
			["MP*4PRODUTOS", 10.66, 11, 12, "2024-04-27"],
			["GreenMan", 31.39, 5, 6, "2024-10-11"],
			["MP*EBANX", 12.95, 5, 12, "2024-10-16"],
			["MERCADOLIVRE*RENOVAFONE", 5.33, 5, 8, "2024-11-11"],
			["Loja", 101.73, 2, 11, "2025-01-17"],
			["Compra internacional em KVB GLOBAL CAPITAL", 81.27, 1, 1, "2025-01-24"],
			["iFood", 5, 1, 1, "2025-02-24"],
		]);
	});

	test("preserves modern purchases, repeated merchants and anticipation across pages", () => {
		const statement = parseCreditCardStatementText(
			`Vence em 20/05/2026
Movimentações na fatura
09/05 Crédito concedido R$ 169,99
12/05 Pagamento da fatura de maio/2026 R$ 475,47
Cartão Visa
12/11 HOYOVERSE Parcela 7 de 12 R$ 43,11
12/11 HOYOVERSE Parcela 7 de 12 R$ 21,98
04/04 MP*CELLFYBR Parcela 6 de 7 R$ 24,28
04/04 MP*CELLFYBR Parcela 3 de 7 R$ 24,28
Total R$ 645,46
-- 3 of 6 --
Cartão Visa
04/04 MP*CELLFYBR Parcela 4 de 7 R$ 24,28
04/04 MP*CELLFYBR Parcela 5 de 7 R$ 24,28
04/04 MP*CELLFYBR Parcela 2 de 7 R$ 24,28
04/04 MP*CELLFYBR Parcela 7 de 7 R$ 24,28
07/05 MERCADOLIVRE*AP R$ 88,90
Fechamento da fatura 15/05/2026
Próximo fechamento 15/06/2026`,
			"MERCADO_PAGO",
		);
		expect(statement.nextStatementDate).toBe("2026-06-15");
		expect(statement.purchases).toHaveLength(5);
		expect(statement.purchases[3]!.description).toBe(
			"MP*CELLFYBR [[anticipated:2:2428;3:2428;4:2428;5:2428;6:2428;7:2428]]",
		);
		expect(statement.purchases[4]!.installmentAmount).toBe(88.9);
	});

	test("does not decode modern text containing legacy-looking merchant characters", () => {
		const text = "Cartão Visa\n01/05 MP*LOJA_49 R$ 17,98\nFechamento da fatura 15/05/2026";
		expect(normalizeMercadoPagoText(text)).toBe(text);
	});
});
