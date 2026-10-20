import { parseBradescoPurchases } from "./bradesco-purchases";

export function parseBradescoCreditCardStatementText(text: string) {
	const start = text.search(/Nacionais\s+em\s+Reais\s*\(R\$\)/iu);
	const end = text.search(/(?:Lançamentos\s+)?Total parcelado para as próximas faturas/iu);
	if (start < 0 || end <= start) throw new Error("Não foi possível encontrar os lançamentos da fatura");
	return parseBradescoPurchases(text, text.slice(start, end));
}
