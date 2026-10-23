import { groupAnticipatedInstallments } from "./anticipated-installments";
import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";
import { normalizeMercadoPagoText } from "./mercado-pago-text";
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
		const statementDistance = Math.min(
			Math.abs(monthDistance - expectedDistance),
			Math.abs(monthDistance - currentInstallment),
		);
		return { date, score: statementDistance * 10 + Math.abs(monthDistance) };
	});
	const valid = candidates.filter(candidate => candidate.date <= statementDate);
	const selected = valid.toSorted((left, right) => left.score - right.score)[0];
	if (!selected) throw new Error("Data da compra inválida");
	return dateKey(selected.date.getDate(), selected.date.getMonth() + 1, selected.date.getFullYear());
}

export function parseMercadoPagoCreditCardStatementText(text: string): CreditCardStatement {
	text = normalizeMercadoPagoText(text);
	const dueDateMatch =
		text.match(/Vence em\s*(\d{2}\/\d{2}\/\d{4})/iu) ?? text.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/iu);
	const statementDateMatch = text.match(/Fechamento da fatura\s*(\d{2}\/\d{2}\/\d{4})/iu);
	if (!dueDateMatch && !statementDateMatch)
		throw new Error("Não foi possível identificar vencimento e fechamento da fatura");
	const dueDate = dueDateMatch ? parseFullDate(dueDateMatch[1]!) : undefined;
	const statementDate = statementDateMatch ? parseFullDate(statementDateMatch[1]!) : undefined;
	const referenceDate = (statementDate ?? dueDate)!;
	const cardSectionStart = text.search(/Cartão\s+(?:Visa|Mastercard)/iu);
	if (cardSectionStart < 0) throw new Error("Não foi possível encontrar as compras da fatura");
	const cardSectionEnd = text.search(/Parcele a fatura/iu);
	// Refund movements precede card purchases and carry positive bank magnitudes.
	const movementsStart = text.search(/Movimentações na fatura/iu);
	const sectionStart =
		movementsStart >= 0 && movementsStart < cardSectionStart ? movementsStart : cardSectionStart;
	const cardSection = text.slice(sectionStart, cardSectionEnd < 0 ? undefined : cardSectionEnd);
	const purchasePattern =
		/^(\d{2})\/(\d{2})\s+(.+?)(?:\s+Parcela\s+(\d+)\s+de\s+(\d+))?\s+([−-]?[\t ]*R\$[\t ]*[−-]?[\t ]*[\d.]+,\d{2}[\t ]*[−-]?)[\t ]*$/gimu;
	const purchases: CreditCardStatementPurchase[] = [];
	for (const match of cardSection.matchAll(purchasePattern)) {
		if (/^pagamento\b/iu.test(match[3]!.trim())) continue;
		const installmentAmount = moneyToNumber(match[6]!);
		const currentInstallment = Number(match[4] ?? 1);
		const installments = Number(match[5] ?? 1);
		if (currentInstallment < 1 || installments < currentInstallment || installments > 48) continue;
		purchases.push({
			currentInstallment,
			description: match[3]!.trim(),
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
		provider: "MERCADO_PAGO",
		purchases: groupAnticipatedInstallments(purchases),
		statementDate: statementDate
			? dateKey(statementDate.getDate(), statementDate.getMonth() + 1, statementDate.getFullYear())
			: undefined,
	};
}
