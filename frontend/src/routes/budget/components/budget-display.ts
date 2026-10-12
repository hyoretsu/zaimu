import type { MonthlyBudget } from "@/lib/monthly-budget-service";

export const budgetMoney = (amount: number, currency: string) =>
	new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(amount);
export const budgetSourceLabel = (item: MonthlyBudget) =>
	item.source === "STATEMENTS"
		? "Faturas de todos os cartões"
		: item.source === "TAG"
			? "Despesas por tag"
			: "Reserva livre";
