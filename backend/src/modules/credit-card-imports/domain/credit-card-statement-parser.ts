import { HttpException } from "~/shared/errors";
import { loadPdfParser } from "~/shared/pdf-worker";
import { parseBradescardCreditCardStatementText } from "./bradescard-credit-card";
import { parseBradescoCreditCardStatementText } from "./bradesco-credit-card";
import type { CreditCardImportProvider } from "./credit-card-statement";
import {
	type CreditCardStatementLayout,
	selectCreditCardStatementLayout,
} from "./credit-card-statement-layout";
import { parseInterCreditCardStatementText } from "./inter-credit-card";
import { parseMercadoPagoCreditCardStatementText } from "./mercado-pago-credit-card";
import { parseNubankCreditCardStatementText } from "./nubank-credit-card";
import { parsePicPayCreditCardStatementText } from "./picpay-credit-card";
import { statementPreviousBalance } from "./statement-previous-balance";

const creditCardStatementLayouts: readonly CreditCardStatementLayout[] = [
	{
		id: "bradesco-classic",
		matches: text =>
			/Nacionais em Reais/iu.test(text) && /Total parcelado para as próximas faturas/iu.test(text),
		parse: parseBradescoCreditCardStatementText,
		provider: "BRADESCO",
	},
	{
		id: "bradescard-account-movements",
		matches: text => /Movimentações da conta/iu.test(text) && /Nacionais em Reais/iu.test(text),
		parse: parseBradescardCreditCardStatementText,
		provider: "BRADESCO",
	},
	{ id: "inter", matches: () => true, parse: parseInterCreditCardStatementText, provider: "INTER" },
	{
		id: "mercado-pago",
		matches: () => true,
		parse: parseMercadoPagoCreditCardStatementText,
		provider: "MERCADO_PAGO",
	},
	{ id: "nubank", matches: () => true, parse: parseNubankCreditCardStatementText, provider: "NUBANK" },
	{ id: "picpay", matches: () => true, parse: parsePicPayCreditCardStatementText, provider: "PICPAY" },
];

export function parseCreditCardStatementText(text: string, provider: CreditCardImportProvider) {
	if (!text.trim()) throw new HttpException("Não foi possível extrair texto do PDF", 400);
	const layout = selectCreditCardStatementLayout(text, provider, creditCardStatementLayouts);
	return {
		...layout.parse(text),
		reportedPreviousBalance: statementPreviousBalance(text),
	};
}

export async function parseCreditCardStatementPdf(
	data: ArrayBuffer,
	provider: CreditCardImportProvider,
	password?: string,
) {
	const { PDFParse } = await loadPdfParser();
	const parser = new PDFParse({ data: new Uint8Array(data), password });
	try {
		const { text } = await parser.getText();
		return parseCreditCardStatementText(text, provider);
	} catch (error) {
		if (error instanceof HttpException) throw error;
		if (error instanceof Error && /password|senha/iu.test(error.message))
			throw new HttpException("Informe a senha correta do PDF", 400);
		throw new HttpException(error instanceof Error ? error.message : "Não foi possível ler a fatura", 400);
	} finally {
		await parser.destroy();
	}
}
