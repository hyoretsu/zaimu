import { PDFParse } from "pdf-parse";
import { HttpException } from "~/shared/errors";
import type { CreditCardImportProvider } from "./credit-card-statement";
import { parseMercadoPagoCreditCardStatementText } from "./mercado-pago-credit-card";

export async function parseCreditCardStatementPdf(data: ArrayBuffer, provider: CreditCardImportProvider) {
	const parser = new PDFParse({ data: new Uint8Array(data) });
	try {
		const { text } = await parser.getText();
		if (!text.trim()) throw new HttpException("Não foi possível extrair texto do PDF", 400);
		if (provider === "MERCADO_PAGO") return parseMercadoPagoCreditCardStatementText(text);
		throw new HttpException("Instituição de cartão não suportada", 400);
	} catch (error) {
		if (error instanceof HttpException) throw error;
		throw new HttpException(error instanceof Error ? error.message : "Não foi possível ler a fatura", 400);
	} finally {
		await parser.destroy();
	}
}
