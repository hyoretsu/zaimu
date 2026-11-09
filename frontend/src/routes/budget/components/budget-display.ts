import { createCurrencyFormatter } from "@/lib/format-currency";
import type { MonthlyBudget } from "@/lib/monthly-budget-service";

export const budgetMoney = (amount: number, currency: string) =>
	createCurrencyFormatter(currency).format(amount);
export const budgetSourceLabel = (item: Pick<MonthlyBudget, "source">) =>
	item.source === "STATEMENTS"
		? "Faturas"
		: item.source === "TAG"
			? "Etiqueta"
			: item.source === "CUSTOM"
				? "Título"
				: item.source === "RESERVE"
					? "Reserva"
					: "Sem categoria";
