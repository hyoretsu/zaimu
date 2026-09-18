import { addMonths } from "date-fns";

export function importedInstallmentDates(
	statementDate: Date,
	dueDate: Date,
	currentInstallment: number,
	installment: number,
) {
	const offset = installment - currentInstallment;
	return { dueDate: addMonths(dueDate, offset), statementDate: addMonths(statementDate, offset) };
}
