import { groupAnticipatedInstallments } from "./anticipated-installments";
import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";

const monthNumbers: Record<string, number> = {
	abr: 4,
	ago: 8,
	dez: 12,
	fev: 2,
	jan: 1,
	jul: 7,
	jun: 6,
	mai: 5,
	mar: 3,
	nov: 11,
	out: 10,
	set: 9,
};

const moneyToNumber = (value: string) =>
	Number(
		value
			.replace(/[^\d,.-]/g, "")
			.replace(/\./g, "")
			.replace(",", "."),
	);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

function parseFullDate(value: string) {
	const [day, month, year] = value.split("/").map(Number);
	if (!day || !month || !year) throw new Error("Data inválida");
	return new Date(year, month - 1, day);
}

function parseStatementDate(text: string, dueDate: Date) {
	const dateMatch = text.match(/DATA\s+DOCUMENTO\s+(\d{2}\/\d{2}\/\d{4})/iu);
	return dateMatch ? parseFullDate(dateMatch[1]!) : dueDate;
}

function isPurchase(description: string, amount: string) {
	return !amount.includes("+") && !/^(?:pagamento|estorno|crédito)/iu.test(description);
}

export function parseInterCreditCardStatementText(text: string): CreditCardStatement {
	const dueDateMatch = text.match(/Data\s+de\s+Vencimento\s+(\d{2}\/\d{2}\/\d{4})/iu);
	if (!dueDateMatch) throw new Error("Não foi possível identificar o vencimento da fatura");
	const dueDate = parseFullDate(dueDateMatch[1]!);
	const statementDate = parseStatementDate(text, dueDate);
	const expensesStart = text.search(/Despesas\s+da\s+fatura/iu);
	if (expensesStart < 0) throw new Error("Não foi possível encontrar as despesas da fatura");
	const expensesAfterStart = text.slice(expensesStart);
	const nextStatementOffset = expensesAfterStart.search(/Próxima\s+fatura/iu);
	const expenses = expensesAfterStart.slice(0, nextStatementOffset < 0 ? undefined : nextStatementOffset);
	const purchasePattern =
		/^(\d{2})\s+de\s+([A-Za-zÀ-ÿ]{3})\.?(?:\s+)(\d{4})\s+(.+?)[\t ]+-[\t ]+((?:\+|−|-)?[\t ]*R\$[\t ]*[\d., ]+)$/gimu;
	const purchases: CreditCardStatementPurchase[] = [];
	for (const match of expenses.matchAll(purchasePattern)) {
		const description = match[4]!.trim();
		if (!isPurchase(description, match[5]!)) continue;
		const month = monthNumbers[match[2]!.toLocaleLowerCase("pt-BR")];
		if (!month) continue;
		const installment = description.match(/\s*\(Parcela\s+(\d{1,2})\s+de\s+(\d{1,2})\)\s*$/iu);
		const currentInstallment = Number(installment?.[1] ?? 1);
		const installments = Number(installment?.[2] ?? 1);
		const installmentAmount = moneyToNumber(match[5]!);
		if (
			currentInstallment < 1 ||
			installments < currentInstallment ||
			installments > 48 ||
			!Number.isFinite(installmentAmount)
		)
			continue;
		purchases.push({
			currentInstallment,
			description: description.replace(/\s*\(Parcela\s+\d{1,2}\s+de\s+\d{1,2}\)\s*$/iu, ""),
			installmentAmount,
			installments,
			purchaseDate: dateKey(new Date(Number(match[3]), month - 1, Number(match[1]))),
			statementPurchaseDate: `${match[1]}/${match[2]}/${match[3]}`,
			totalAmount: Math.round(installmentAmount * installments * 100) / 100,
		});
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return {
		dueDate: dateKey(dueDate),
		provider: "INTER",
		purchases: groupAnticipatedInstallments(purchases),
		statementDate: dateKey(statementDate),
	};
}
