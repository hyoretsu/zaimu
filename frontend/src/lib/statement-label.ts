import { formatLocalDate, formatLocalMonthYear, getLocalMonthKey } from "./date";

interface LabelStatement {
	id: string;
	dueDate: string;
	creditCardId?: string;
}
export function statementLabel(statement: LabelStatement, statements: LabelStatement[]) {
	const duplicate = statements.some(
		item =>
			item.id !== statement.id &&
			item.creditCardId === statement.creditCardId &&
			getLocalMonthKey(item.dueDate) === getLocalMonthKey(statement.dueDate),
	);
	return `${formatLocalMonthYear(statement.dueDate)}${duplicate ? ` - vence ${formatLocalDate(statement.dueDate, { day: "2-digit", month: "2-digit" })}` : ""}`;
}
