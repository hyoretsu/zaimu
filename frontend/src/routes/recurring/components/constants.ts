import type { RecurrenceFrequency, RecurringSource } from "./types";

export const frequencyOptions: Array<{ label: string; value: RecurrenceFrequency }> = [
	{ label: "Diária", value: "DAILY" },
	{ label: "Semanal", value: "WEEKLY" },
	{ label: "Quinzenal", value: "BIWEEKLY" },
	{ label: "Mensal", value: "MONTHLY" },
	{ label: "Anual", value: "YEARLY" },
];

export const weekdayOptions = [
	{ label: "Usar dia da data inicial", value: "default" },
	{ label: "Domingo", value: "0" },
	{ label: "Segunda-feira", value: "1" },
	{ label: "Terça-feira", value: "2" },
	{ label: "Quarta-feira", value: "3" },
	{ label: "Quinta-feira", value: "4" },
	{ label: "Sexta-feira", value: "5" },
	{ label: "Sábado", value: "6" },
] as const;

export const sourceOptions: Array<{ label: string; value: RecurringSource }> = [
	{ label: "Salário ou renda", value: "salary" },
	{ label: "Assinatura", value: "subscription" },
	{ label: "Pagamento recorrente", value: "recurring" },
];

export const paymentMethodOptions = [
	{ label: "Cartão de crédito", value: "CREDIT" },
	{ label: "Débito", value: "DEBIT" },
	{ label: "Pix", value: "PIX" },
	{ label: "Dinheiro", value: "CASH" },
	{ label: "Transferência", value: "TRANSFER" },
	{ label: "Boleto", value: "BOLETO" },
] as const;

export const frequencyLabels = Object.fromEntries(
	frequencyOptions.map(option => [option.value, option.label]),
) as Record<RecurrenceFrequency, string>;

export const sourceLabels: Record<RecurringSource, string> = {
	recurring: "Recorrência",
	salary: "Salário",
	subscription: "Assinatura",
};

export const paymentMethodLabels = Object.fromEntries(
	paymentMethodOptions.map(option => [option.value, option.label]),
) as Record<(typeof paymentMethodOptions)[number]["value"], string>;
