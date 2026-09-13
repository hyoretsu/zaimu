import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";

const moneyToNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
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

function findStatementDate(text: string, dueDate: Date) {
	const closingDate = text.match(
		/(?:data\s+de\s+fechamento|fechamento\s+da\s+fatura|fechamento:)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/iu,
	);
	return closingDate ? parseFullDate(closingDate[1]!) : dueDate;
}

function isPurchase(description: string) {
	return !/^(?:pagamento|saldo anterior|créditos?|total|compras|limites?|saque|data\s+descrição)/iu.test(
		description,
	);
}

export function parseBradescoCreditCardStatementText(text: string): CreditCardStatement {
	const dueDateMatch = text.match(/Vencimento\s*(\d{2}\/\d{2}\/\d{4})/iu);
	if (!dueDateMatch) throw new Error("Não foi possível identificar o vencimento da fatura");
	const dueDate = parseFullDate(dueDateMatch[1]!);
	const statementDate = findStatementDate(text, dueDate);
	const transactionsStart = text.search(/Nacionais\s+em\s+Reais\s*\(R\$\)/iu);
	const transactionsEnd = text.search(/(?:Lançamentos\s+)?Total parcelado para as próximas faturas/iu);
	if (transactionsStart < 0 || transactionsEnd <= transactionsStart)
		throw new Error("Não foi possível encontrar os lançamentos da fatura");
	const transactionsSection = text.slice(transactionsStart, transactionsEnd);
	const purchasePattern = /^(\d{2})\/(\d{2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s*-)?$/gimu;
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
			description,
			installmentAmount,
			installments,
			purchaseDate: inferPurchaseDate(Number(match[1]), Number(match[2]), statementDate, currentInstallment),
			totalAmount: Math.round(installmentAmount * installments * 100) / 100,
		});
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return {
		dueDate: dateKey(dueDate.getDate(), dueDate.getMonth() + 1, dueDate.getFullYear()),
		provider: "BRADESCO",
		purchases,
		statementDate: dateKey(
			statementDate.getDate(),
			statementDate.getMonth() + 1,
			statementDate.getFullYear(),
		),
	};
}
