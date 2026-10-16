export interface MonthlyBudget {
	id: string;
	userId: string;
	name: string;
	source: "TAG" | "STATEMENTS" | "CUSTOM" | "RESERVE" | "UNCATEGORIZED";
	categoryId: string | null;
	parentBudgetId?: string | null;
	amount: number;
	currency: string;
	startMonth: string;
	endMonth: string | null;
	createdAt?: string;
	updatedAt?: string;
	baseUpdatedAt?: string;
}

export type MonthlyBudgetInput = Omit<
	MonthlyBudget,
	"id" | "userId" | "createdAt" | "updatedAt" | "baseUpdatedAt" | "amount"
> & { amount?: number | null };

export function validateMonthlyBudget(input: MonthlyBudgetInput): MonthlyBudgetInput & { amount: number } {
	const month = /^\d{4}-(0[1-9]|1[0-2])$/;
	if (input.name.trim().length > 100) throw new Error("Informe um nome de até 100 caracteres.");
	if (!["TAG", "STATEMENTS", "CUSTOM", "RESERVE", "UNCATEGORIZED"].includes(input.source))
		throw new Error("Selecione uma origem válida.");
	const amount = input.amount ?? 0;
	if (!Number.isFinite(amount) || amount < 0 || (input.source !== "UNCATEGORIZED" && amount === 0))
		throw new Error("Informe um valor planejado maior que zero.");
	if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Selecione uma moeda válida.");
	if (!month.test(input.startMonth) || (input.endMonth !== null && !month.test(input.endMonth)))
		throw new Error("Informe meses válidos.");
	if (input.endMonth && input.endMonth < input.startMonth)
		throw new Error("O mês final deve ser igual ou posterior ao inicial.");
	if (input.source === "TAG" && !input.categoryId) throw new Error("Selecione uma tag.");
	return {
		...input,
		amount,
		categoryId: input.source === "TAG" ? input.categoryId : null,
		name: input.name.trim(),
	};
}
