import { LuCalendarDays, LuCircleDot, LuReceiptText, LuTriangleAlert } from "react-icons/lu";
import type { CreditCardStatement } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";

export function getCreditCardStatementStatus(statement: CreditCardStatement) {
	const today = getLocalDateKey();

	if (statement.isForecast) {
		return { className: "text-muted-foreground", icon: LuCalendarDays, label: "Fatura futura" };
	}
	if (!statement.isPaid && (statement.status === "CARRIED" || statement.dueDate.slice(0, 10) < today)) {
		return { className: "text-destructive", icon: LuTriangleAlert, label: "Fatura vencida" };
	}
	if (statement.statementDate.slice(0, 10) <= today) {
		return { className: "text-foreground", icon: LuReceiptText, label: "Fatura fechada" };
	}

	return { className: "text-foreground", icon: LuCircleDot, label: "Fatura em aberto" };
}
