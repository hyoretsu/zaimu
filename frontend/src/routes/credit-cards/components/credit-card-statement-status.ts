import { LuCircleCheck, LuCircleDot, LuReceiptText, LuTriangleAlert } from "react-icons/lu";
import type { CreditCardStatement } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";

export function getCreditCardStatementStatus(statement: CreditCardStatement) {
	const today = getLocalDateKey();

	if (statement.isForecast) {
		return { className: "text-muted-foreground", icon: null, label: "Fatura prevista" };
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

	return { className: "text-foreground", icon: LuCircleDot, label: "Fatura aberta" };
}
