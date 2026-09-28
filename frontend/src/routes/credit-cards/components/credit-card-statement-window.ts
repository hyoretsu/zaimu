import { paymentStatementDates } from "@zaimu/finance/credit-card";
import type { CreditCard, CreditCardStatement } from "@/lib/api";
import { getLocalDateKey, getLocalMonthKey } from "@/lib/date";

export type StatementWindowItem = CreditCardStatement & { isEmptyCycle?: boolean };

export function getFirstNonZeroStatementMonth(statements: CreditCardStatement[]) {
	return statements
		.filter(statement =>
			[
				statement.totalAmount,
				statement.chargesAmount,
				statement.amountDue,
				statement.balanceAmount,
				statement.paidAmount,
			].some(amount => amount !== undefined && amount !== 0),
		)
		.map(statement => getLocalMonthKey(statement.dueDate))
		.toSorted()[0];
}

export function getStatementWindowRadius(isDesktop: boolean, viewportSize: number, tabSize: number, gap = 8) {
	if (!isDesktop) return 3;
	return Math.max(1, Math.floor((viewportSize - tabSize) / (2 * (tabSize + gap)))) + 2;
}

export function getStatementWindow(
	card: Pick<CreditCard, "id" | "dueDay" | "statementDay">,
	statements: CreditCardStatement[],
	month: string,
	previous: number,
	next: number,
): StatementWindowItem[] {
	const byMonth = new Map(statements.map(statement => [getLocalMonthKey(statement.dueDate), statement]));
	const firstMonth = getFirstNonZeroStatementMonth(statements) ?? month;
	const [year, monthNumber] = (firstMonth > month ? firstMonth : month).split("-").map(Number);
	return Array.from({ length: previous + next + 1 }, (_, index) => {
		const reference = new Date(year, monthNumber - 1 + index - previous, 1, 12);
		const key = getLocalMonthKey(reference);
		const known = byMonth.get(key);
		if (known) return known;
		const dates = paymentStatementDates(card, `${key}-01`);
		return {
			...dates,
			balanceAmount: 0,
			creditCardId: card.id,
			id: `empty-${card.id}-${key}`,
			isEmptyCycle: true,
			isForecast: dates.statementDate > getLocalDateKey(),
			isPaid: dates.statementDate <= getLocalDateKey(),
			paidAmount: 0,
			totalAmount: 0,
		};
	}).filter(statement => getLocalMonthKey(statement.dueDate) >= firstMonth);
}
