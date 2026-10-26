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
import { normalizeMercadoPagoText } from "./mercado-pago-text";
import { parseNubankCreditCardStatementText } from "./nubank-credit-card";
import { parsePicPayCreditCardStatementText } from "./picpay-credit-card";
import { statementPreviousBalance } from "./statement-previous-balance";
import { parseWillBankCreditCardStatementText } from "./will-bank-credit-card";

const creditCardStatementLayouts: readonly CreditCardStatementLayout[] = [
	{
		id: "will-bank-legacy",
		matches: text => /Detalhamento da fatura de/iu.test(text) && /Cartão Mastercard/iu.test(text),
		parse: parseWillBankCreditCardStatementText,
		provider: "WILL_BANK",
	},
	{
		id: "will-bank-current",
		matches: text =>
			/Lançamentos de/iu.test(text) && /Confira seus gastos e os valores recebidos/iu.test(text),
		parse: parseWillBankCreditCardStatementText,
		provider: "WILL_BANK",
	},
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

/** Read only dates explicitly attributed to the next invoice, shared by all layouts. */
export function nextStatementDateFromText(text: string) {
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
	text = text.replace(
		/(fechamento\s+da\s+(?:sua\s+)?próxima\s+fatura\s*:?\s*)(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/giu,
		(_, label: string, day: string, month: string, year: string) =>
			`${label}${day}/${String(months.indexOf(month.toUpperCase()) + 1).padStart(2, "0")}/${year}`,
	);
	const patterns = [
		/Previsão\s+próximo\s+fechamento\s*(\d{2}[/-]\d{2}[/-]\d{4})/giu,
		/fechamento\s+da\s+(?:sua\s+)?próxima\s+fatura[^\d]{0,40}(\d{2}[/-]\d{2}[/-]\d{4})/giu,
		/próxima\s+fatura\s*(?:data\s+de\s+)?(?:corte|fechamento)\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})/giu,
	];
	const dates = new Set(
		patterns.flatMap(pattern =>
			[...text.matchAll(pattern)].map(match => {
				const [day, month, year] = match[1]!.split(/[/-]/u);
				const date = `${year}-${month}-${day}`;
				const parsed = new Date(`${date}T12:00:00Z`);
				if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
					throw new HttpException("Data de fechamento da próxima fatura inválida", 400);
				return date;
			}),
		),
	);
	if (dates.size > 1) throw new HttpException("Datas de fechamento da próxima fatura conflitantes", 400);
	return [...dates][0];
}

export function parseCreditCardStatementText(text: string, provider: CreditCardImportProvider) {
	if (provider === "MERCADO_PAGO") text = normalizeMercadoPagoText(text);
	if (!text.trim()) throw new HttpException("Não foi possível extrair texto do PDF", 400);
	try {
		const layout = selectCreditCardStatementLayout(text, provider, creditCardStatementLayouts);
		return {
			...layout.parse(text),
			nextStatementDate: nextStatementDateFromText(text),
			reportedPreviousBalance: statementPreviousBalance(text),
		};
	} catch (error) {
		const detail = error instanceof Error ? ` Detalhe: ${error.message}` : "";
		throw new HttpException(
			`Não foi possível ler a fatura para o banco selecionado. Verifique se o banco escolhido corresponde ao arquivo enviado e selecione o banco ou a fatura correta.${detail}`,
			400,
		);
	}
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
		throw new HttpException(
			error instanceof Error ? error.message : "Não foi possível ler a fatura",
			400,
		);
	} finally {
		await parser.destroy();
	}
}
