import { groupAnticipatedInstallments } from "./anticipated-installments";
import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";
import { statementMoney } from "./statement-money";

const moneyToNumber = statementMoney;
const dateKey = (day: number, month: number, year: number) =>
	`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function parseFullDate(value: string) {
	const [day, month, year] = value.split("/").map(Number);
	if (!day || !month || !year) throw new Error("Data inválida");
	return new Date(year, month - 1, day);
}

function inferPurchaseDate(day: number, month: number, statementDate: Date, currentInstallment: number) {
	const statementMonth = statementDate.getFullYear() * 12 + statementDate.getMonth();
	const candidates = [0, 1, 2, 3, 4].map(yearsAgo => {
		const year = statementDate.getFullYear() - yearsAgo;
		const date = new Date(year, month - 1, day);
		const monthDistance = statementMonth - (year * 12 + month - 1);
		const expectedDistance = currentInstallment - 1;
		return {
			date,
			score: Math.abs(monthDistance - expectedDistance) * 10 + Math.abs(monthDistance),
		};
	});
	const selected = candidates
		.filter(candidate => candidate.date <= statementDate)
		.toSorted((a, b) => a.score - b.score)[0];
	if (!selected) throw new Error("Data da compra inválida");
	return dateKey(selected.date.getDate(), selected.date.getMonth() + 1, selected.date.getFullYear());
}

function findStatementDate(text: string) {
	const closingDate = text.match(
		/(?:data\s+de\s+fechamento|fechamento\s+da\s+fatura|fechamento:)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/iu,
	);
	return closingDate ? parseFullDate(closingDate[1]!) : undefined;
}

function isPurchase(description: string) {
	return !/^(?:pagamento|saldo anterior|créditos?\s*$|total|compras|limites?|saque|data\s+descrição)/iu.test(
		description,
	);
}

export function parseBradescoPurchases(text: string, transactionsSection: string): CreditCardStatement {
	const dueDateMatch = text.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/iu);
	const dueDate = dueDateMatch ? parseFullDate(dueDateMatch[1]!) : undefined;
	const statementDate = findStatementDate(text);
	const referenceDate = statementDate ?? dueDate;
	if (!referenceDate) throw new Error("Não foi possível identificar o período da fatura");
	const purchasePattern =
		/^(\d{2})\/(\d{2})\s+(.+?)\s+([−-]?[\t ]*(?:R\$[\t ]*)?[−-]?[\t ]*\d{1,3}(?:\.\d{3})*,\d{2}[\t ]*[−-]?)$/gimu;
	const purchases: CreditCardStatementPurchase[] = [];
	for (const match of transactionsSection.matchAll(purchasePattern)) {
		const description = match[3]!.trim();
		if (!isPurchase(description)) continue;
		const installment = description.match(/\((\d{1,2})\/(\d{1,2})\)\s*$/u);
		const currentInstallment = Number(installment?.[1] ?? 1);
		const installments = Number(installment?.[2] ?? 1);
		if (currentInstallment < 1 || installments < currentInstallment || installments > 48) continue;
		const installmentAmount = moneyToNumber(match[4]!);
		if (!Number.isFinite(installmentAmount)) continue;
		purchases.push({
			currentInstallment,
			description: description.replace(/\s*\(\d{1,2}\/\d{1,2}\)\s*$/u, ""),
			installmentAmount,
			installments,
			purchaseDate: inferPurchaseDate(Number(match[1]), Number(match[2]), referenceDate, currentInstallment),
			statementPurchaseDate: `${match[1]}/${match[2]}`,
			totalAmount: Math.round(installmentAmount * installments * 100) / 100,
		});
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return {
		dueDate: dueDate ? dateKey(dueDate.getDate(), dueDate.getMonth() + 1, dueDate.getFullYear()) : undefined,
		provider: "BRADESCO",
		purchases: groupAnticipatedInstallments(purchases),
		statementDate: statementDate
			? dateKey(statementDate.getDate(), statementDate.getMonth() + 1, statementDate.getFullYear())
			: undefined,
	};
}
