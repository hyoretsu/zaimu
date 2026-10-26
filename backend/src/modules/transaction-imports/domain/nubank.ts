import { HttpException } from "~/shared/errors";
import type { Statement, StatementTransactionType } from "./statement";

const monthNumbers: Record<string, string> = {
	ABR: "04",
	AGO: "08",
	DEZ: "12",
	FEV: "02",
	JAN: "01",
	JUL: "07",
	JUN: "06",
	MAI: "05",
	MAR: "03",
	NOV: "11",
	OUT: "10",
	SET: "09",
};
const sectionPattern =
	/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\s+Total de (entradas|saídas)\s+([+-])\s*([\d.]+,\d{2})$/iu;
const continuedSectionPattern = /^Total de (entradas|saídas)\s+([+-])\s*([\d.]+,\d{2})$/iu;
const amountPattern = /^([\d.]+,\d{2})$/u;

const parseCurrency = (value: string) => Number(value.replaceAll(".", "").replace(",", "."));
const cleanDescription = (parts: string[]) => parts.join(" ").replace(/\s+/gu, " ").trim();

function removePageChrome(text: string) {
	return text
		.replace(/^[^\n]+\n[^\n]*CPF Agência Conta[^\n]*\n[^\n]*\n?/gmu, "")
		.replace(
			/Tem alguma dúvida\?[\s\S]*?(?=\n\s*-- \d+ of \d+ --|\n[^\n]+\n[^\n]*CPF Agência Conta|\n\s*\d{2} [A-Z]{3} \d{4}|$)/gu,
			"",
		)
		.replace(/^.*Extrato gerado dia.*$/gmu, "")
		.replace(/^-- \d+ of \d+ --$/gmu, "")
		.replace(/^.*(?:CPF Agência Conta|VALORES EM R\$).*$/gmu, "")
		.replace(
			/^\s*(?:Saldo final do período|Saldo inicial|Rendimento líquido|Total de entradas|Total de saídas)\s*$/gmu,
			"",
		)
		.replace(/^\s*\d{8,}-\d\s*$/gmu, "")
		.replace(/^\s*a\s*\d{2} DE [A-ZÇ]+ DE \d{4}.*$/gmu, "")
		.replace(/^\s*Movimentações\s*$/gmu, "");
}

export function parseNubankStatementText(text: string): Statement {
	text = text.replaceAll("−", "-");
	if (!/Nu Pagamentos S\.A\.|Movimentações/iu.test(text) || !/\d{2} DE [A-ZÇ]+ DE \d{4}/u.test(text))
		throw new HttpException("O arquivo não parece ser um extrato Nubank válido", 400);
	const period = text.match(/(\d{2}) DE ([A-ZÇ]+) DE (\d{4})\s+a\s+(\d{2}) DE ([A-ZÇ]+) DE (\d{4})/iu);
	const parsePeriodDate = (day: string, month: string, year: string) => {
		const monthNumber = monthNumbers[month.toLocaleUpperCase("pt-BR").slice(0, 3)];
		if (!monthNumber) throw new HttpException("Período inválido no extrato Nubank", 400);
		return `${year}-${monthNumber}-${day}`;
	};
	const lines = removePageChrome(text)
		.split("\n")
		.map(line => line.trim())
		.filter(Boolean);
	const transactions: Array<{
		amount: number;
		date: string;
		description: string;
		expectedTotal: number;
		type: StatementTransactionType;
	}> = [];
	let date = "";
	let type: StatementTransactionType | null = null;
	let expectedTotal: number | null = null;
	let description: string[] = [];
	const totals = new Map<string, { expected: number; parsed: number }>();
	const flush = (standaloneAmount?: string) => {
		if (!description.length) return;
		const last = description.at(-1)!;
		const inline = standaloneAmount ? null : last.match(/^(.*?)\s+([\d.]+,\d{2})$/u);
		const amountValue = standaloneAmount ?? inline?.[2];
		if (!amountValue || !date || !type || expectedTotal === null) return;
		if (inline) description[description.length - 1] = inline[1];
		const amount = parseCurrency(amountValue);
		const key = `${date}|${type}|${expectedTotal}`;
		const current = totals.get(key) ?? { expected: expectedTotal, parsed: 0 };
		current.parsed += amount;
		totals.set(key, current);
		transactions.push({ amount, date, description: cleanDescription(description), expectedTotal, type });
		description = [];
	};
	for (const line of lines) {
		const section = line.match(sectionPattern);
		if (section) {
			flush();
			date = `${section[3]}-${monthNumbers[section[2].toUpperCase()]}-${section[1]}`;
			type = section[4].toLocaleLowerCase("pt-BR") === "entradas" ? "INCOME" : "EXPENSE";
			expectedTotal = parseCurrency(section[6]);
			continue;
		}
		const continuedSection = line.match(continuedSectionPattern);
		if (continuedSection) {
			flush();
			type = continuedSection[1].toLocaleLowerCase("pt-BR") === "entradas" ? "INCOME" : "EXPENSE";
			expectedTotal = parseCurrency(continuedSection[3]);
			continue;
		}
		if (!date || !type || expectedTotal === null) continue;
		if (amountPattern.test(line)) {
			flush(line);
			continue;
		}
		flush();
		description.push(line);
	}
	flush();
	if (!transactions.length)
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato Nubank", 400);
	for (const { expected, parsed } of totals.values())
		if (Math.round(expected * 100) !== Math.round(parsed * 100))
			throw new HttpException("Os totais do extrato Nubank não correspondem às movimentações", 400);
	return {
		periodEnd: period ? parsePeriodDate(period[4], period[5], period[6]) : undefined,
		periodStart: period ? parsePeriodDate(period[1], period[2], period[3]) : undefined,
		provider: "NUBANK",
		transactions: transactions.map(({ expectedTotal: _, ...transaction }) => transaction),
	};
}
