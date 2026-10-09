import { HttpException } from "~/shared/errors";
import { loadPdfParser } from "~/shared/pdf-worker";
import { parseBancoDoBrasilStatementText } from "./banco-do-brasil";
import { parseInterStatementText } from "./inter";
import { parseMercadoPagoStatementText } from "./mercado-pago";
import { parseNubankStatementText } from "./nubank";
import { parsePicPayStatementText } from "./picpay";
import type { Statement, StatementProvider } from "./statement";

const knownParsers: Array<{
	detect: (text: string) => boolean;
	parse: (text: string) => Statement;
	provider: StatementProvider;
}> = [
	{
		detect: text => /EXTRATO DE CONTA/iu.test(text) && /ID da operação/iu.test(text),
		parse: parseMercadoPagoStatementText,
		provider: "MERCADO_PAGO",
	},
	{
		detect: text => /Nu Pagamentos S\.A\.|Movimentações/iu.test(text),
		parse: parseNubankStatementText,
		provider: "NUBANK",
	},
	{
		detect: text => /Extrato de Conta Corrente/iu.test(text) && /Lançamentos/iu.test(text),
		parse: parseBancoDoBrasilStatementText,
		provider: "BANCO_DO_BRASIL",
	},
	{
		detect: text => /Instituição:\s*Banco Inter/iu.test(text) && /Saldo do dia:/iu.test(text),
		parse: parseInterStatementText,
		provider: "INTER",
	},
	{
		detect: text => /PicPay Serviços S\/A/iu.test(text) && /Extrato de conta/iu.test(text),
		parse: parsePicPayStatementText,
		provider: "PICPAY",
	},
];

export async function parseStatementPdf(
	data: ArrayBuffer,
	requestedProvider: StatementProvider,
): Promise<Statement> {
	const { PDFParse } = await loadPdfParser();
	const parser = new PDFParse({ data: new Uint8Array(data) });
	try {
		const { text } = await parser.getText();
		if (!text.trim()) throw new HttpException("Não foi possível extrair texto do PDF", 400);
		const provider = knownParsers.find(candidate => candidate.provider === requestedProvider)!;
		return provider.parse(text);
	} catch (error) {
		if (error instanceof HttpException) throw error;
		throw new HttpException("Não foi possível ler o PDF do extrato", 400);
	} finally {
		await parser.destroy();
	}
}
