import { LuCircleCheck, LuCircleDot, LuReceiptText, LuTriangleAlert } from "react-icons/lu";
import type { CreditCardStatement } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";

export function getCreditCardStatementStatus(statement: CreditCardStatement, today = getLocalDateKey()) {
	if (statement.isForecast) {
		return { className: "text-muted-foreground", icon: null, label: "" };
	}
	if (statement.isPaid) {
		return { className: "text-success-600", icon: LuCircleCheck, label: "Fatura paga" };
	}
	if (statement.status === "CARRIED" || statement.dueDate.slice(0, 10) < today) {
		return { className: "text-destructive", icon: LuTriangleAlert, label: "Fatura atrasada" };
	}
	if (statement.statementDate.slice(0, 10) <= today) {
		return { className: "text-foreground", icon: LuReceiptText, label: "Fatura fechada" };
	}

	const closing = new Date(`${statement.statementDate.slice(0, 10)}T12:00:00Z`);
	const previousMonthEnd = new Date(Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth(), 0));
	const opening = new Date(
		Date.UTC(
			previousMonthEnd.getUTCFullYear(),
			previousMonthEnd.getUTCMonth(),
			Math.min(closing.getUTCDate(), previousMonthEnd.getUTCDate()),
		),
	)
		.toISOString()
		.slice(0, 10);
	if (today < opening) {
		return { className: "text-muted-foreground", icon: null, label: "" };
	}

	return { className: "text-foreground", icon: LuCircleDot, label: "Fatura aberta" };
}
