import { parseBradescoPurchases } from "./bradesco-purchases";

/** Bradescard statements place transaction columns before the invoice header. */
export function parseBradescardCreditCardStatementText(text: string) {
	const dueDate =
		text.match(/Data\s+de\s+Vencimento\s*(\d{2}\/\d{2}\/\d{4})/iu) ??
		text.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/iu);
	if (!dueDate) throw new Error("Não foi possível identificar o vencimento da fatura");
	const sections = [
		...text.matchAll(
			/Nacionais\s+em\s+Reais\s*\(R\$\)([\s\S]*?)(?=Resumo dos encargos financeiros|Fique atento|Canais de Atendimento|237\s*-|-- \d+ of \d+ --|$)/giu,
		),
	].map(match => match[1]!);
	if (!sections.length) throw new Error("Não foi possível encontrar os lançamentos da fatura");
	return parseBradescoPurchases(`Vencimento ${dueDate[1]}\n${text}`, sections.join("\n"));
}
