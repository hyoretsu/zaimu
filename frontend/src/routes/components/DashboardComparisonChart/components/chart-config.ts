import type { ChartConfig } from "@/components/ui/chart";

export const chartConfig = {
	accountBalance: { color: "#0ea5e9", label: "Em conta" },
	cardExpenses: { color: "#f97316", label: "Faturas" },
	endingBalance: { color: "var(--color-primary)", label: "Patrimônio" },
	fixedIncomeBalance: { color: "#f59e0b", label: "Renda fixa" },
	otherExpenses: { color: "#fb7185", label: "Outras saídas" },
	otherIncome: { color: "#34d399", label: "Outras entradas" },
	recurringCardExpenses: { color: "#d946ef", label: "Assinaturas" },
	recurringExpenses: { color: "#be123c", label: "Gastos recorrentes" },
	recurringIncome: { color: "#047857", label: "Renda" },
	variableIncomeBalance: { color: "#8b5cf6", label: "Renda variável" },
} satisfies ChartConfig;
