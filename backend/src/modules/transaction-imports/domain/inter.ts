import { HttpException } from "~/shared/errors";
import type { Statement } from "./statement";
import { statementCurrency, statementCurrencyPattern } from "./statement-money";

const monthNumbers: Record<string, string> = {
	ABRIL: "04",
	AGOSTO: "08",
	DEZEMBRO: "12",
	FEVEREIRO: "02",
	JANEIRO: "01",
	JULHO: "07",
	JUNHO: "06",
	MAIO: "05",
	MARÇO: "03",
	NOVEMBRO: "11",
	OUTUBRO: "10",
	SETEMBRO: "09",
};
const periodPattern = /Período:\s*(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/iu;
const datePattern = /(\d{1,2})\s+de\s+([A-Za-zÇç]+)\s+de\s+(\d{4})\s+Saldo do dia:/iu;
const entryPattern = new RegExp(
	String.raw`^(.*?)\s+(${statementCurrencyPattern})\s+(${statementCurrencyPattern})$`,
	"u",
);

const toDate = (day: string, month: string, year: string) => {
	const monthNumber = monthNumbers[month.toLocaleUpperCase("pt-BR")];
	if (!monthNumber) throw new HttpException("Data inválida no extrato Banco Inter", 400);
	return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
};

export function parseInterStatementText(text: string): Statement {
	if (!/Instituição:\s*Banco Inter/iu.test(text) || !periodPattern.test(text))
		throw new HttpException("O arquivo não parece ser um extrato Banco Inter válido", 400);
	const period = text.match(periodPattern)!;
	const transactions: Statement["transactions"] = [];
	let currentDate = "";
	let description: string[] = [];
	const flush = () => {
		if (!description.length || !currentDate) return;
		const entry = description.join(" ").replace(/\s+/gu, " ").trim().match(entryPattern);
		if (!entry) return;
		transactions.push({
			amount: Math.abs(statementCurrency(entry[2])),
			balanceAfter: statementCurrency(entry[3]),
			date: currentDate,
			description: entry[1].trim(),
			type: statementCurrency(entry[2]) < 0 ? "EXPENSE" : "INCOME",
		});
		description = [];
	};
	for (const rawLine of text.split("\n")) {
		const line = rawLine.replaceAll("\t", " ").trim();
		if (!line) continue;
		const date = line.match(datePattern);
		if (date) {
			flush();
			currentDate = toDate(date[1], date[2], date[3]);
			description = [];
			continue;
		}
		if (/^(?:Valor|Saldo por transação|Fale com a gente|SAC:|-- \d+ of \d+ --)/iu.test(line)) continue;
		if (!currentDate) continue;
		description.push(line);
		if (entryPattern.test(description.join(" ").replace(/\s+/gu, " ").trim())) flush();
	}
	flush();
	if (!transactions.length)
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato Banco Inter", 400);
	return {
		periodEnd: `${period[6]}-${period[5]}-${period[4]}`,
		periodStart: `${period[3]}-${period[2]}-${period[1]}`,
		provider: "INTER",
		transactions,
	};
}
