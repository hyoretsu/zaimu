import { HttpException } from "~/shared/errors";
import type { Statement, StatementTransaction } from "./statement";
import { statementCurrency, statementCurrencyPattern } from "./statement-money";

const periodPattern = /Período do extrato:?\s*(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/iu;
const entryPattern = new RegExp(
	String.raw`^(\d{2})/(\d{2})/(\d{4}) (\d{2})h(\d{2}) (.+?) (${statementCurrencyPattern})$`,
	"u",
);
const categories = ["Outra Categoria", "Transferência", "Pagamentos", "Investimentos", "Rendimentos"];

function cleanDescription(value: string) {
	let text = value.trim();
	for (const category of categories) {
		if (text.startsWith(`${category} `)) {
			text = text.slice(category.length).trim();
			break;
		}
	}
	return text.replace(/\s+/gu, " ");
}

export function parseBtgPactualStatementText(text: string): Statement {
	const period = periodPattern.exec(text);
	if (!period) throw new HttpException("Período do extrato BTG Pactual não encontrado", 400);
	const transactions: StatementTransaction[] = [];
	for (const raw of text.split(/\r?\n/u)) {
		const line = raw.replace(/\s+/gu, " ").trim();
		const match = entryPattern.exec(line);
		if (!match) continue;
		const [, day, month, year, hour, minute, rest, value] = match;
		if (/^(?:Outra Categoria )?Saldo Diário$/iu.test(rest!.trim())) continue;
		const signed = statementCurrency(value!);
		if (signed === 0) continue;
		transactions.push({
			amount: Math.abs(signed),
			date: `${year}-${month}-${day}`,
			description: cleanDescription(rest!),
			time: `${hour}:${minute}`,
			type: signed < 0 ? "EXPENSE" : "INCOME",
		});
	}
	if (!transactions.length)
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato BTG Pactual", 400);
	return {
		periodEnd: `${period[6]}-${period[5]}-${period[4]}`,
		periodStart: `${period[3]}-${period[2]}-${period[1]}`,
		provider: "BTG_PACTUAL",
		transactions,
	};
}
