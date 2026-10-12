import { expect, test } from "bun:test";
import { dailyBalanceSummary } from "./daily-balance-summary";

test("keeps account closing balances separate and consolidates only equal currencies", () => {
	const result = dailyBalanceSummary(
		[
			{ accountId: "nubank", balance: "1100.50", currency: "BRL", date: "2026-10-31" },
			{ accountId: "other", balance: -100, currency: "BRL", date: "2026-10-31" },
			{ accountId: "usd", balance: 40, currency: "USD", date: "2026-10-31" },
			{ accountId: "nubank", balance: 600, currency: "BRL", date: "2026-10-02" },
		],
		"2026-10-31",
	);
	expect(result.accountEndingBalances).toEqual([
		{ amount: 1100.5, currency: "BRL", financialAccountId: "nubank" },
		{ amount: -100, currency: "BRL", financialAccountId: "other" },
		{ amount: 40, currency: "USD", financialAccountId: "usd" },
	]);
	expect(result.endingBalances).toEqual([
		{ amount: 1000.5, currency: "BRL" },
		{ amount: 40, currency: "USD" },
	]);
	expect(result.endingBalance).toBe(1000.5);
});

test("preserves zero account balances and empty dates", () => {
	expect(
		dailyBalanceSummary([{ accountId: "a", balance: 0, currency: "BRL", date: "2026-10-31" }], "2026-10-31")
			.accountEndingBalances[0]?.amount,
	).toBe(0);
	expect(dailyBalanceSummary([], "2026-10-31")).toEqual({
		accountEndingBalances: [],
		endingBalance: 0,
		endingBalances: [],
	});
});
