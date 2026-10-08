import { expect, test } from "bun:test";
import { resolveFinancialMoney } from "./financial-money";

test("foreign principal and fees convert together on original date while retaining editable source", async () => {
	const date = "2026-10-01";
	const fees = [
		{ amount: 3.5, name: "IOF", type: "PERCENTAGE" as const },
		{ amount: 2, name: "Spread", type: "PERCENTAGE" as const },
	];
	const result = await resolveFinancialMoney(
		{ amount: 100, currency: "usd", date, fees, targetCurrency: "BRL" },
		async (amount, requestedDate, from, to) => {
			expect([amount, requestedDate, from, to]).toEqual([105.5, date, "USD", "BRL"]);
			return { amount: 527.5, rate: 5 };
		},
	);
	expect(result).toEqual({
		amount: 527.5,
		bookingCurrency: "BRL",
		currency: "USD",
		exchangeRate: 5,
		feeAmount: 27.5,
		fees,
		originalAmount: 100,
	});
});
test("editing stored original principal never reapplies conversion to converted total", async () => {
	const fees = [{ amount: 1, name: "Taxa", type: "FIXED" as const }];
	const convert = async (amount: number) => ({ amount: amount * 5, rate: 5 });
	const initial = await resolveFinancialMoney(
		{ amount: 100, currency: "USD", date: "2026-10-01", fees, targetCurrency: "BRL" },
		convert,
	);
	const edited = await resolveFinancialMoney(
		{
			amount: initial.originalAmount,
			currency: initial.currency,
			date: "2026-10-02",
			fees: initial.fees,
			targetCurrency: "BRL",
		},
		convert,
	);
	expect(edited.amount).toBe(initial.amount);
});
