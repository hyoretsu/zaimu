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
	expect(rows[0].totalPaid).toBeCloseTo(rows[2].totalPaid, 1);
});
test("zero interest remains finite and SAC decreases installments", () => {
	expect(loanInstallments({ ...terms, interestRate: 0 })[0].totalPaid).toBe(333.33);
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

test("loan principal distributes ISO minor units without remainder loss", () => {
	for (const currency of ["JPY", "KWD"])
		for (const amortization of ["SAC", "PRICE"] as const) {
			const principalAmount = currency === "JPY" ? 1000 : 1.001;
			const rows = loanInstallments({
				...terms,
				amortization,
				currency,
				interestRate: 0,
				principalAmount,
			});
			expect(
				rows.reduce(
					(sum, row) => sum + Math.round(row.principalPaid * (currency === "JPY" ? 1 : 1000)),
					0,
				),
			).toBe(currency === "JPY" ? 1000 : 1001);
			expect(rows.every(row => row.currency === currency)).toBe(true);
			expect(rows.every(row => Number.isInteger(row.totalPaid * (currency === "JPY" ? 1 : 1000)))).toBe(
				true,
			);
		}
	expect(() => loanInstallments({ ...terms, currency: "JPY", principalAmount: 1.5 })).toThrow();
});
