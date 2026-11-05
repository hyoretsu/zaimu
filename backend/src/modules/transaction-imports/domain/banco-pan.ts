import { HttpException } from "~/shared/errors";
import type { Statement, StatementTransaction } from "./statement";
import { statementCurrency } from "./statement-money";

const periodPattern = /Extrato de (\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/iu;
const datePattern = /^(\d{2})\/(\d{2}) \d+$/u;
const amountPattern = String.raw`R\$ [\d.]+,\d{2}`;
// Text extraction yields "saldo descrição valor sinal"; some readers keep the visual "sinal valor saldo" order.
const extractedMovementPattern = new RegExp(
	String.raw`^${amountPattern} (.+?) (${amountPattern}) ([+−-])$`,
	"u",
);
const visualMovementPattern = new RegExp(
	String.raw`^(.+?) ([+−-]) (${amountPattern}) ${amountPattern}$`,
	"u",
);

export function parseBancoPanStatementText(text: string): Statement {
	const period = text.match(periodPattern);
	if (!period || !/conta Pan/iu.test(text)) throw new HttpException("Extrato Banco PAN inválido", 400);

	const [, , startMonth, startYear] = period;
	const transactions: StatementTransaction[] = [];
	let currentDate: string | undefined;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.replaceAll("\t", " ").replace(/\s+/gu, " ").trim();
		const date = line.match(datePattern);
		if (date) {
			// The statement period never exceeds a year, so earlier months belong to the following year.
			const year = Number(date[2]) < Number(startMonth) ? Number(startYear) + 1 : Number(startYear);
			currentDate = `${year}-${date[2]}-${date[1]}`;
			continue;
		}
		if (!currentDate) continue;
		const extracted = line.match(extractedMovementPattern);
		const visual = extracted ? undefined : line.match(visualMovementPattern);
		const movement = extracted
			? { amount: extracted[2], description: extracted[1], sign: extracted[3] }
			: visual
				? { amount: visual[3], description: visual[1], sign: visual[2] }
				: undefined;
		if (!movement) continue;
		transactions.push({
			amount: Math.abs(statementCurrency(movement.amount)),
			date: currentDate,
			description: movement.description.trim(),
			type: movement.sign === "+" ? "INCOME" : "EXPENSE",
		});
		currentDate = undefined;
	}

	if (!transactions.length)
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato Banco PAN", 400);
	return {
		periodEnd: `${period[6]}-${period[5]}-${period[4]}`,
		periodStart: `${period[3]}-${period[2]}-${period[1]}`,
		provider: "BANCO_PAN",
		transactions,
	};
}
