import type { MonthlyBudget } from "@/lib/monthly-budget-service";

export const budgetMoney = (amount: number, currency: string) =>
	new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(amount);
export const budgetSourceLabel = (item: Pick<MonthlyBudget, "source">) =>
	item.source === "STATEMENTS"
		? "Faturas"
		: item.source === "TAG"
			? "Etiqueta"
			: item.source === "CUSTOM"
				? "Título"
				: "Reserva";
