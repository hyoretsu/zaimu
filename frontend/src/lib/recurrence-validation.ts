import {
	recurrenceNeedsConfiguration,
	validateRecurrenceInstallments,
	validateRecurrenceSchedule,
} from "@zaimu/finance/recurrence";
import type { RecurrenceInput } from "./recurrence";

export function validateRecurrenceInput(input: RecurrenceInput): void {
	if (!input.name.trim()) throw new Error("Informe a descrição.");
	if (!Number.isFinite(input.amount) || input.amount <= 0)
		throw new Error("Informe um valor positivo válido.");
	if (!input.currency?.trim()) throw new Error("Selecione a moeda.");
	if (recurrenceNeedsConfiguration(input))
		throw new Error("Selecione as contas ou o cartão obrigatórios. Na transferência, use contas diferentes.");
	validateRecurrenceSchedule(input);
	validateRecurrenceInstallments(input);
	if (["MONTH", "YEAR"].includes(input.unit) && input.dayOfMonth == null)
		throw new Error("Informe o dia do mês.");
}
