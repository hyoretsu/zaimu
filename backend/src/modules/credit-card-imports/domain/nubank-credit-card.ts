import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";

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

const moneyToNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
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
	const dueDateMatch = text.match(/Data\s+de\s+vencimento:\s*(\d{2}\s+[A-Za-zÀ-ÿ]{3}\s+\d{4})/iu);
	const periodMatch = text.match(
		/Período\s+vigente:\s*\d{2}\s+[A-Za-zÀ-ÿ]{3}\s+a\s+(\d{2}\s+[A-Za-zÀ-ÿ]{3})/iu,
	);
	if (!dueDateMatch || !periodMatch)
		throw new Error("Não foi possível identificar vencimento e período da fatura");
	const dueDate = parseInvoiceDate(dueDateMatch[1]!.toUpperCase());
	const statementDate = parseInvoiceDate(`${periodMatch[1]!.toUpperCase()} ${dueDate.getFullYear()}`);
	const transactionsStart = text.search(/TRANSAÇÕES\s+DE/iu);
	const paymentsStart = text.search(/Pagamentos\s+-?R\$/iu);
	if (transactionsStart < 0) throw new Error("Não foi possível encontrar as transações da fatura");
	const transactions = text.slice(transactionsStart, paymentsStart < 0 ? undefined : paymentsStart);
	const normalizedTransactions = transactions.replace(
		/^(\d{2}\s+[A-Za-zÀ-ÿ]{3}\s+[^\n]+)\n(?:USD\s+[^\n]+\n)?(?:Conversão:\s*[^\n]+\n)?(R\$\s*[\d.]+,\d{2})$/gimu,
		"$1 $2",
	);
	const purchasePattern =
		/^(\d{2})\s+([A-Za-zÀ-ÿ]{3})\s+(?:••••\s+\d{4}\s+)?(.+?)\s+R\$\s*([\d.]+,\d{2})$/gimu;
	const purchases: CreditCardStatementPurchase[] = [];
	for (const match of normalizedTransactions.matchAll(purchasePattern)) {
		const description = match[3]!.trim();
		const installment = description.match(/\s+-\s+Parcela\s+(\d{1,2})\/(\d{1,2})\s*$/iu);
		const currentInstallment = Number(installment?.[1] ?? 1);
		const installments = Number(installment?.[2] ?? 1);
		const installmentAmount = moneyToNumber(match[4]!);
		if (
			currentInstallment < 1 ||
			installments < currentInstallment ||
			installments > 48 ||
			!Number.isFinite(installmentAmount)
		)
			continue;
		purchases.push({
			currentInstallment,
			description: description.replace(/\s+-\s+Parcela\s+\d{1,2}\/\d{1,2}\s*$/iu, ""),
			installmentAmount,
			installments,
			purchaseDate: parsePurchaseDate(
				Number(match[1]),
				match[2]!.toUpperCase(),
				statementDate,
				currentInstallment,
			),
			totalAmount: Math.round(installmentAmount * installments * 100) / 100,
		});
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return { dueDate: dateKey(dueDate), provider: "NUBANK", purchases, statementDate: dateKey(statementDate) };
}
