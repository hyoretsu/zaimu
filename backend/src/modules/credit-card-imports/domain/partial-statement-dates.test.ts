import { expect, test } from "bun:test";
import { parseBradescoPurchases } from "./bradesco-purchases";
import { parseInterCreditCardStatementText } from "./inter-credit-card";
import { parseMercadoPagoCreditCardStatementText } from "./mercado-pago-credit-card";
import { parseNubankCreditCardStatementText } from "./nubank-credit-card";
import { parsePicPayCreditCardStatementText } from "./picpay-credit-card";

const readers = [
	{
		closing: "Data de fechamento 19/08/2026",
		due: "Vencimento 25/08/2026",
		name: "Bradesco",
		parse: (text: string) => parseBradescoPurchases(text, "07/08 LOJA 11,99"),
	},
	{
		closing: "DATA DOCUMENTO 19/08/2026",
		due: "Data de Vencimento 25/08/2026",
		name: "Inter",
		parse: (text: string) =>
			parseInterCreditCardStatementText(`${text}\nDespesas da fatura\n07 de ago. 2026 LOJA - R$ 11,99`),
	},
	{
		closing: "Fechamento da fatura 19/08/2026",
		due: "Vence em 25/08/2026",
		name: "Mercado Pago",
		parse: (text: string) =>
			parseMercadoPagoCreditCardStatementText(`${text}\nCartão Visa\n07/08 LOJA R$ 11,99`),
	},
	{
		closing: "Fechamento: 19/08/2026",
		due: "Vencimento: 25/08/2026",
		name: "PicPay",
		parse: (text: string) =>
			parsePicPayCreditCardStatementText(
				`${text}\nTransações Nacionais\n07/08 LOJA 11,99\nSubtotal dos lançamentos 11,99`,
			),
	},
];
for (const reader of readers) {
	test(`${reader.name}: missing closing and due dates stay absent independently`, () => {
		const dueOnly = reader.parse(reader.due);
		expect(dueOnly.dueDate).toBe("2026-08-25");
		expect(dueOnly.statementDate).toBeUndefined();
		const closingOnly = reader.parse(reader.closing);
		expect(closingOnly.statementDate).toBe("2026-08-19");
		expect(closingOnly.dueDate).toBeUndefined();
	});
}
test("Nubank does not substitute due date for absent period", () => {
	const result = parseNubankCreditCardStatementText(
		"Data de vencimento: 25 AGO 2026\nTRANSAÇÕES DE 17 JUL A 17 AGO\n07 AGO LOJA R$ 11,99",
	);
	expect(result.dueDate).toBe("2026-08-25");
	expect(result.statementDate).toBeUndefined();
});
