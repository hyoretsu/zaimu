import { expect, test } from "bun:test";
import { loanInstallments } from "./loan";

const terms = {
	amortization: "PRICE" as const,
	firstDueDate: "2026-01-31",
	interestRate: 0.01,
	principalAmount: 1000,
	totalInstallments: 3,
};
test("PRICE amortizes principal and preserves end-of-month anchor", () => {
	const rows = loanInstallments(terms);
	expect(rows.map(row => row.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
	expect(rows.reduce((sum, row) => sum + row.principalPaid, 0)).toBeCloseTo(1000, 8);
	expect(rows[0].totalPaid).toBeCloseTo(rows[2].totalPaid, 8);
});
test("zero interest remains finite and SAC decreases installments", () => {
	expect(loanInstallments({ ...terms, interestRate: 0 })[0].totalPaid).toBeCloseTo(1000 / 3);
	const rows = loanInstallments({ ...terms, amortization: "SAC" });
	expect(rows[0].totalPaid).toBeGreaterThan(rows[2].totalPaid);
});
test("removed amortization and invalid monetary terms are rejected", () => {
	expect(() => loanInstallments({ ...terms, amortization: "SACRE" as typeof terms.amortization })).toThrow(
		"Amortização inválida",
	);
	for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1])
		expect(() => loanInstallments({ ...terms, principalAmount: value })).toThrow();
});
