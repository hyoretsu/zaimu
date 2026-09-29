import { expect, test } from "bun:test";
import { assertImportedInstallmentChronology, importedInstallmentDates } from "./imported-installment-dates";

test("anchors imported installments to the PDF statement instead of inferring from purchase date", () => {
	const dates = importedInstallmentDates(new Date(2026, 7, 19), new Date(2026, 7, 25), 10, 10);
	expect(dates.statementDate).toEqual(new Date(2026, 7, 19));
	expect(dates.dueDate).toEqual(new Date(2026, 7, 25));
	expect(
		importedInstallmentDates(new Date(2026, 7, 19), new Date(2026, 7, 25), 10, 11).statementDate,
	).toEqual(new Date(2026, 8, 19));
});

test("rejects an imported third installment before the original purchase can reach its first invoice", () => {
	expect(() => assertImportedInstallmentChronology(new Date(2026, 7, 26), new Date(2026, 7, 15), 3)).toThrow(
		"A data da compra é incompatível",
	);
	expect(() =>
		assertImportedInstallmentChronology(new Date(2026, 7, 26), new Date(2026, 8, 15), 1),
	).not.toThrow();
	expect(() =>
		assertImportedInstallmentChronology(new Date(2026, 5, 10), new Date(2026, 7, 15), 3),
	).not.toThrow();
});
