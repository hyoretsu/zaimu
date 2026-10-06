import { statementDueDate } from "@zaimu/finance/credit-card";
import { purchaseStatementDates } from "@zaimu/finance/credit-purchase";

interface Calendar {
	createdAt: Date;
	dueDay: number;
	statementDay: number;
	workingDueDate?: boolean;
}
const key = (date: Date) => date.toISOString().slice(0, 10);

export function getStatementDates(card: Omit<Calendar, "createdAt">, purchaseDate: Date) {
	const dates = purchaseStatementDates(card, key(purchaseDate));
	return {
		dueDate: new Date(`${dates.dueDate}T12:00:00Z`),
		statementDate: new Date(`${dates.statementDate}T12:00:00Z`),
	};
}

/** Closing-day 1 and month-end clamping must not shift the requested period. */
export function missingMonthlyStatements(card: Calendar, statements: Date[], asOf: Date) {
	const existing = new Set(statements.map(key));
	const first = statements.length
		? [...existing].sort()[0]!
		: key(getStatementDates(card, card.createdAt).statementDate);
	const last = getStatementDates(card, asOf).statementDate;
	const month = new Date(`${first.slice(0, 7)}-01T12:00:00Z`);
	const lastMonth = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1, 12);
	const missing: Array<{ dueDate: string; statementDate: string }> = [];
	while (month.valueOf() <= lastMonth) {
		const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12)).getUTCDate();
		const closing = new Date(
			Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(card.statementDay, lastDay), 12),
		);
		if (!existing.has(key(closing)))
			missing.push({ dueDate: statementDueDate(card, closing), statementDate: key(closing) });
		month.setUTCMonth(month.getUTCMonth() + 1);
	}
	return missing;
}
