export interface MonthlyBudget {
	id: string;
	userId: string;
	name: string;
	source: "TAG" | "STATEMENTS" | "CUSTOM";
	categoryId: string | null;
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
	"id" | "userId" | "createdAt" | "updatedAt" | "baseUpdatedAt"
>;

export function validateMonthlyBudget(input: MonthlyBudgetInput): MonthlyBudgetInput {
	const month = /^\d{4}-(0[1-9]|1[0-2])$/;
	if (!input.name.trim() || input.name.trim().length > 100)
		throw new Error("Informe um nome de até 100 caracteres.");
	if (!["TAG", "STATEMENTS", "CUSTOM"].includes(input.source))
		throw new Error("Selecione uma origem válida.");
	if (!Number.isFinite(input.amount) || input.amount <= 0)
		throw new Error("Informe um valor planejado maior que zero.");
	if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Selecione uma moeda válida.");
	if (!month.test(input.startMonth) || (input.endMonth !== null && !month.test(input.endMonth)))
		throw new Error("Informe meses válidos.");
	if (input.endMonth && input.endMonth < input.startMonth)
		throw new Error("O mês final deve ser igual ou posterior ao inicial.");
	if (input.source === "TAG" && !input.categoryId) throw new Error("Selecione uma tag.");
	return { ...input, categoryId: input.source === "TAG" ? input.categoryId : null, name: input.name.trim() };
}
