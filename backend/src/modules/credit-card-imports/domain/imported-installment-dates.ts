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

export function assertImportedInstallmentChronology(
	purchaseDate: Date,
	statementDate: Date,
	currentInstallment: number,
) {
	const firstStatement = addMonths(statementDate, 1 - currentInstallment);
	if (firstStatement.toISOString().slice(0, 10) <= purchaseDate.toISOString().slice(0, 10))
		throw new RangeError(
			"A data da compra é incompatível com a parcela e a fatura importada. Confira se esta é a mesma compra.",
		);
}
