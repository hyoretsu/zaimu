import type { RecurrenceMovement, RecurrenceUnit } from "@zaimu/finance/recurrence";
export interface UnifiedRecurringDraft {
	name: string;
	amount: string;
	installments: string;
	movement: RecurrenceMovement;
	unit: RecurrenceUnit;
	interval: string;
	dayOfMonth: string;
	dayOfWeek: string;
	startDate: string;
	endDate: string;
	originFinancialAccountId: string;
	destinationFinancialAccountId: string;
	creditCardId: string;
	storeName: string;
	tagIds: string[];
}
export const movementLabels: Record<RecurrenceMovement, string> = {
	CARD_PAYMENT: "Pagamento do cartão",
	CARD_PURCHASE: "Compra no cartão",
	EXPENSE: "Saída de conta",
	INCOME: "Entrada em conta",
	TRANSFER: "Transferência entre contas",
};
export const unitLabels: Record<RecurrenceUnit, string> = {
	DAY: "dias",
	MONTH: "meses",
	WEEK: "semanas",
	YEAR: "anos",
};
export const unitSingularLabels: Record<RecurrenceUnit, string> = {
	DAY: "dia",
	MONTH: "mês",
	WEEK: "semana",
	YEAR: "ano",
};
export const scheduleLabel = (unit: RecurrenceUnit, interval: number) =>
	`A cada ${interval} ${interval === 1 ? unitSingularLabels[unit] : unitLabels[unit]}`;
