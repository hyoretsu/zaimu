import { expect, test } from "bun:test";
import { importedMoney } from "./imported-money";

test("import preserves native KWD debit and separately converts JPY payment", async () => {
	const date = new Date("2026-01-02T00:00:00Z");
	const calls: unknown[] = [];
	const result = await importedMoney(
		{
			amount: 1.001,
			date,
			destinationFinancialAccountId: null,
			originFinancialAccountId: "kwd",
			paymentCreditCardId: "jpy",
			type: "EXPENSE",
		},
		{
			creditCardCurrency: async () => "JPY",
			ensureCurrencyRates: async (...args) => {
				calls.push(args);
				return 500;
			},
			financialAccountCurrency: async () => "KWD",
		},
	);
	expect(result).toMatchObject({
		bookingCurrency: "KWD",
		currency: "KWD",
		exchangeRate: "1",
		originalAmount: "1.001",
		paymentAmount: "501",
		paymentCurrency: "JPY",
	});
	expect(calls).toEqual([[date, "KWD", "JPY"]]);
});

test("import transfer preserves independent destination units", async () => {
	const result = await importedMoney(
		{
			amount: 10,
			date: new Date("2026-01-02"),
			destinationFinancialAccountId: "kwd",
			originFinancialAccountId: "usd",
			paymentCreditCardId: null,
			type: "TRANSFER",
		},
		{
			creditCardCurrency: async () => "USD",
			ensureCurrencyRates: async () => 0.3071,
			financialAccountCurrency: async id => (id === "usd" ? "USD" : "KWD"),
		},
	);
	expect(result).toMatchObject({
		currency: "USD",
		destinationAmount: "3.071",
		destinationCurrency: "KWD",
		originalAmount: "10",
	});
});
