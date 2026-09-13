import { PDFParse } from "pdf-parse";
import { HttpException } from "~/shared/errors";
import { parseBradescoCreditCardStatementText } from "./bradesco-credit-card";
import type { CreditCardImportProvider } from "./credit-card-statement";
import { parseMercadoPagoCreditCardStatementText } from "./mercado-pago-credit-card";

export async function parseCreditCardStatementPdf(
	data: ArrayBuffer,
	provider: CreditCardImportProvider,
	password?: string,
) {
	const parser = new PDFParse({ data: new Uint8Array(data), password });
	try {
		const { text } = await parser.getText();
		if (!text.trim()) throw new HttpException("Não foi possível extrair texto do PDF", 400);
		if (provider === "MERCADO_PAGO") return parseMercadoPagoCreditCardStatementText(text);
		if (provider === "BRADESCO") return parseBradescoCreditCardStatementText(text);
		throw new HttpException("Instituição de cartão não suportada", 400);
	} catch (error) {
		if (error instanceof HttpException) throw error;
		if (error instanceof Error && /password|senha/iu.test(error.message))
			throw new HttpException("Informe a senha correta do PDF", 400);
		throw new HttpException(error instanceof Error ? error.message : "Não foi possível ler a fatura", 400);
	} finally {
		await parser.destroy();
	}
}
