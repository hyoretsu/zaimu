import { groupAnticipatedInstallments } from "./anticipated-installments";
import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";
import { statementMoney } from "./statement-money";

const monthNumbers: Record<string, number> = {
	ABR: 4,
	AGO: 8,
	DEZ: 12,
	FEV: 2,
	JAN: 1,
	JUL: 7,
	JUN: 6,
	MAI: 5,
	MAR: 3,
	NOV: 11,
	OUT: 10,
	SET: 9,
};

const moneyToNumber = statementMoney;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

function parseInvoiceDate(value: string) {
	const [day, monthName, year] = value.split(/\s+/u);
	const month = monthNumbers[monthName!];
	if (!day || !month || !year) throw new Error("Data inválida");
	return new Date(Number(year), month - 1, Number(day));
}

function parsePurchaseDate(day: number, monthName: string, statementDate: Date, currentInstallment: number) {
	const month = monthNumbers[monthName];
	if (!month) throw new Error("Mês inválido");
	const year =
		month > statementDate.getMonth() + 1 ? statementDate.getFullYear() - 1 : statementDate.getFullYear();
	const date = new Date(year, month - 1, day);
	date.setMonth(date.getMonth() - currentInstallment + 1);
	return dateKey(date);
}

export function parseNubankCreditCardStatementText(text: string): CreditCardStatement {
	const dueDateMatch = text.match(/(?:Data\s+d[eo]\s+)?vencimento\s*:?\s*(\d{2}\s+[A-Za-zÀ-ÿ]{3}\s+\d{4})/iu);
	const periodMatch = text.match(
		/(?:Período\s+vigente:|Total\s+de\s+compras(?:\s+de\s+todos\s+os\s+cartões)?,)\s*\d{2}\s+[A-Za-zÀ-ÿ]{3}\s+a\s+(\d{2}\s+[A-Za-zÀ-ÿ]{3})/iu,
	);
	if (!dueDateMatch) throw new Error("Não foi possível identificar vencimento e período da fatura");
	const dueDate = parseInvoiceDate(dueDateMatch[1]!.toUpperCase());
	const statementDate = periodMatch
		? parseInvoiceDate(`${periodMatch[1]!.toUpperCase()} ${dueDate.getFullYear()}`)
		: undefined;
	if (statementDate && statementDate > dueDate) statementDate.setFullYear(statementDate.getFullYear() - 1);
	const referenceDate = statementDate ?? dueDate;
	const transactionsStart = text.search(/TRANSAÇÕES\s+DE/iu);
	const paymentsStart = text.search(/Pagamentos\s+-?R\$/iu);
	if (transactionsStart < 0) throw new Error("Não foi possível encontrar as transações da fatura");
	const transactions = text.slice(transactionsStart, paymentsStart < 0 ? undefined : paymentsStart);
	// Notes may precede the row amount or continue after a page break.
	let inNote = false;
	const normalizedTransactions = transactions
		.split("\n")
		.filter(line => {
			if (/^\d{2}\s+[A-Za-zÀ-ÿ]{3}\s/u.test(line)) inNote = false;
			if (/^Total a pagar:/iu.test(line)) inNote = true;
			if (!inNote) return !/^(?:USD|Conversão:)/iu.test(line);
			if (/^[−-]?(?:R\$\s*)?[\d.]+,\d{2}[\t ]*[−-]?\s*$/u.test(line)) return true;
			if (/(?:parcelas de R\$[\d., ]+|juros\))\.\s*$/u.test(line)) inNote = false;
			return false;
		})
		.join("\n");
	const purchasePattern =
		/^(\d{2})[\t ]+([A-Za-zÀ-ÿ]{3})[\t ]+(?:••••\s+\d{4}\s+)?((?:(?!\n\d{2}[\t ]+[A-Za-zÀ-ÿ]{3}[\t ])[\s\S])*?)[\t \n]+([−-]?[\t ]*(?:R\$[\t ]*)?[−-]?[\t ]*[\d.]+,\d{2}[\t ]*[−-]?)(?=[\t ]*(?:\n|$))/gimu;
	const purchases: CreditCardStatementPurchase[] = [];
	for (const match of normalizedTransactions.matchAll(purchasePattern)) {
		const description = match[3]!.trim().replace(/\s+/gu, " ");
		if (/^pagamento\b/iu.test(description)) continue;
		const installment = description.match(/\s+-\s+(?:Parcela\s+)?(\d{1,2})\/(\d{1,2})\s*$/iu);
		const currentInstallment = Number(installment?.[1] ?? 1);
		const installments = Number(installment?.[2] ?? 1);
		const amount = moneyToNumber(match[4]!);
		const installmentAmount = /^(?:Estorno|Desconto)\b/iu.test(description) ? -Math.abs(amount) : amount;
		if (
			currentInstallment < 1 ||
			installments < currentInstallment ||
			installments > 48 ||
			!Number.isFinite(installmentAmount)
		)
			continue;
		purchases.push({
			currentInstallment,
			description: description
				.replace(/^Antecipada\s+-\s+/iu, "")
				.replace(/\s+-\s+(?:Parcela\s+)?\d{1,2}\/\d{1,2}\s*$/iu, ""),
			installmentAmount,
			installments,
			purchaseDate: parsePurchaseDate(
				Number(match[1]),
				match[2]!.toUpperCase(),
				referenceDate,
				currentInstallment,
			),
			// Historical financing rows reuse the same title for different plans.
			statementPurchaseDate: `${match[1]}/${match[2]}/${Math.abs(installmentAmount)}`,
			totalAmount: Math.round(installmentAmount * installments * 100) / 100,
		});
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return {
		dueDate: dateKey(dueDate),
		provider: "NUBANK",
		purchases: groupAnticipatedInstallments(purchases),
		statementDate: statementDate ? dateKey(statementDate) : undefined,
	};
}
