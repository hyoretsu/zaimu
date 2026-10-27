import { toCents } from "@zaimu/finance/credit-card";
import {
	LuArrowRight,
	LuCircleCheck,
	LuCircleDot,
	LuClock,
	LuReceiptText,
	LuTriangleAlert,
} from "react-icons/lu";
import type { CreditCardStatement } from "@/lib/api";
import { getCreditCardStatementDisplayBalance } from "@/lib/credit-card-statement-balance";
import { getLocalDateKey } from "@/lib/date";

export function getCreditCardStatementStatus(
	statement: CreditCardStatement & { payments?: readonly { date: string; amount: number }[] },
	today = getLocalDateKey(),
) {
	if (statement.isForecast) {
		return { className: "text-muted-foreground", icon: null, label: "" };
	}
	if (statement.isPaid) {
		return { className: "text-success-600", icon: LuCircleCheck, label: "Fatura paga" };
	}
	if (statement.status === "CARRIED") {
		return { className: "text-destructive", icon: LuArrowRight, label: "Saldo transposto" };
	}
	const scheduledAmount = Math.max(
		toCents(statement.scheduledPaymentAmount ?? 0),
		statement.payments?.reduce(
			(sum, payment) =>
				payment.amount > 0 &&
				payment.date.slice(0, 10) > today &&
				payment.date.slice(0, 10) > statement.statementDate.slice(0, 10)
					? sum + toCents(payment.amount)
					: sum,
			0,
		) ?? 0,
	);
	const remainingAmount = toCents(getCreditCardStatementDisplayBalance(statement));
	if (
		statement.statementDate.slice(0, 10) <= today &&
		remainingAmount > 0 &&
		scheduledAmount >= remainingAmount
	) {
		return {
			className: "text-success-600",
			icon: LuClock,
			label: "Pagamento agendado",
		};
	}
	if (statement.dueDate.slice(0, 10) < today) {
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
