import type { CreditCard, CreditCardStatement } from "@/lib/api";
import { getLocalDateKey, getLocalMonthKey } from "@/lib/date";

export type StatementWindowItem = CreditCardStatement & { isEmptyCycle?: boolean };

export function getSelectedStatement(
	statements: StatementWindowItem[],
	selectedId: string | null,
	currentMonth: string,
	today = getLocalDateKey(),
) {
	return (
		statements.find(statement => statement.id === selectedId) ??
		statements
			.filter(
				statement =>
					!statement.isPaid &&
					!statement.isForecast &&
					statement.statementDate.slice(0, 10) > today,
			)
			.toSorted(
				(a, b) =>
					a.statementDate.localeCompare(b.statementDate) ||
					a.dueDate.localeCompare(b.dueDate) ||
					a.id.localeCompare(b.id),
			)[0] ??
		statements.find(statement => getLocalMonthKey(statement.dueDate) === currentMonth) ??
		statements[0]
	);
}

export function getFirstNonZeroStatementMonth(statements: CreditCardStatement[]) {
	return statements
		.filter(statement => statement.totalAmount !== 0)
		.map(statement => getLocalMonthKey(statement.dueDate))
		.toSorted()[0];
}

export function getStatementWindowRadius(isDesktop: boolean, viewportSize: number, tabSize: number, gap = 8) {
	if (!isDesktop) return 3;
	return Math.max(1, Math.floor((viewportSize - tabSize) / (2 * (tabSize + gap)))) + 2;
}

export function getStatementWindow(
	_card: Pick<CreditCard, "id" | "dueDay" | "statementDay"> & Partial<Pick<CreditCard, "workingDueDate">>,
	statements: CreditCardStatement[],
	month: string,
	previous: number,
	next: number,
): StatementWindowItem[] {
	const visible = statements
		.filter(statement => statement.totalAmount !== 0)
		.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
	const currentIndex = visible.findIndex(statement => getLocalMonthKey(statement.dueDate) >= month);
	const center = currentIndex === -1 ? Math.max(0, visible.length - 1) : currentIndex;
	const start = getLocalMonthKey(visible[Math.max(0, center - previous)]?.dueDate ?? `${month}-01`);
	const end = getLocalMonthKey(
		visible[Math.min(visible.length - 1, center + next)]?.dueDate ?? `${month}-01`,
	);
	return visible.filter(
		item => getLocalMonthKey(item.dueDate) >= start && getLocalMonthKey(item.dueDate) <= end,
	);
}
