import { HttpException } from "~/shared/errors";
import type { Statement } from "./statement";
import { statementCurrency, statementCurrencyPattern } from "./statement-money";

const monthNumbers: Record<string, string> = {
	abril: "04",
	agosto: "08",
	dezembro: "12",
	fevereiro: "02",
	janeiro: "01",
	julho: "07",
	junho: "06",
	maio: "05",
	março: "03",
	novembro: "11",
	outubro: "10",
	setembro: "09",
};
const datePattern = /^(\d{1,2}) de ([a-zç]+) (\d{4}) Saldo ao final do dia:/iu;
const movementPattern = new RegExp(
	String.raw`^(\d{2}:\d{2}) (.+?) (${statementCurrencyPattern})(?:\t(.*))?$`,
	"u",
);
const periodPattern = /(\d{1,2}) de ([a-zç]+) de (\d{4})\s+a\s+(\d{1,2}) de ([a-zç]+) de (\d{4})/iu;

const cleanDescription = (value: string) => value.replaceAll("\t", " ").replace(/\s+/gu, " ").trim();
const isCardPurchase = (paymentMethod: string | undefined) => /\bcom cartão\b/iu.test(paymentMethod ?? "");

function toDate(day: string, month: string, year: string) {
	const monthNumber = monthNumbers[month.toLocaleLowerCase("pt-BR")];
	if (!monthNumber) throw new HttpException("Data inválida no extrato PicPay", 400);
	return `${year}-${monthNumber}-${day.padStart(2, "0")}`;
}

export function parsePicPayStatementText(text: string): Statement {
	if (!/PicPay Serviços S\/A/iu.test(text) || !/Extrato de conta/iu.test(text))
		throw new HttpException("O arquivo não parece ser um extrato PicPay válido", 400);
	const period = text.match(periodPattern);
	const transactions: Statement["transactions"] = [];
	let currentDate = "";

	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const date = line.match(datePattern);
		if (date) {
			currentDate = toDate(date[1], date[2], date[3]);
			continue;
		}
		const movement = line.match(movementPattern);
		if (!movement || !currentDate) continue;
		if (isCardPurchase(movement[4])) continue;
		const signedAmount = statementCurrency(movement[3]);
		const amount = Math.abs(signedAmount);
		if (!Number.isFinite(amount)) continue;
		transactions.push({
			amount,
			date: currentDate,
			description: cleanDescription(`${movement[2]} ${movement[4] ?? ""}`),
			time: movement[1],
			type: signedAmount < 0 ? "EXPENSE" : "INCOME",
		});
	}

	if (!transactions.length)
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato PicPay", 400);
	return {
		periodEnd: period ? toDate(period[4], period[5], period[6]) : undefined,
		periodStart: period ? toDate(period[1], period[2], period[3]) : undefined,
		provider: "PICPAY",
		transactions,
	};
}
