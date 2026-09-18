import { expect, test } from "bun:test";
import { importedInstallmentDates } from "./imported-installment-dates";

test("anchors imported installments to the PDF statement instead of inferring from purchase date", () => {
	const dates = importedInstallmentDates(new Date(2026, 7, 19), new Date(2026, 7, 25), 10, 10);
	expect(dates.statementDate).toEqual(new Date(2026, 7, 19));
	expect(dates.dueDate).toEqual(new Date(2026, 7, 25));
	expect(
		importedInstallmentDates(new Date(2026, 7, 19), new Date(2026, 7, 25), 10, 11).statementDate,
	).toEqual(new Date(2026, 8, 19));
});
