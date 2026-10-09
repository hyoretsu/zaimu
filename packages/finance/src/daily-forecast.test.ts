import { describe, expect, test } from "bun:test";
import { dailyForecast } from "./daily-forecast";

const from = "2026-10-04";
describe("daily forecast", () => {
	test("consumes cash, lower yielding reserves, investments, then records deficit", () => {
		const accounts = [
			{ balance: 10, id: "cash", type: "CHECKING" },
			{ balance: 30, id: "high", type: "SAVINGS" },
			{ balance: 20, id: "low", type: "SAVINGS" },
			{ balance: 40, id: "stock", type: "INVESTMENT" },
		];
		const days = dailyForecast({
			accounts,
			from,
			movements: [
				{ amount: 45, date: from, recurring: true, type: "EXPENSE" },
				{ amount: 100, date: "2026-10-05", type: "EXPENSE" },
			],
			netYield: (account, balance) => (account.id === "high" ? balance * 0.01 : 0),
			primaryAccountId: "cash",
			through: "2026-10-05",
		});
		expect(days[0]!.balances.get("low")).toBe(0);
		expect(days[0]!.balances.get("high")).toBe(15.15);
		expect(days[0]!.recurringExpenses).toBe(45);
		expect(days[1]!.accountBalance).toBeCloseTo(-44.85);
		expect(days[1]!.fixedIncomeBalance).toBe(0);
		expect(days[1]!.variableIncomeBalance).toBe(0);
		expect(accounts[0]!.balance).toBe(10);
	});
	test("income precedes expense and interest accrues only on remaining positive balance", () => {
		const [day] = dailyForecast({
			accounts: [{ balance: 20, id: "a", type: "CHECKING" }],
			from,
			movements: [
				{ amount: 50, date: from, type: "EXPENSE" },
				{ amount: 40, date: from, recurring: true, type: "INCOME" },
			],
			netYield: (_account, balance) => balance * 0.1,
			through: from,
		});
		expect(day!.totalBalance).toBe(11);
		expect(day!.income).toBe(41);
		expect(day!.recurringIncome).toBe(40);
	});
	test("transfers preserve totals and no-account deficit remains in cash group", () => {
		const [day] = dailyForecast({
			accounts: [{ balance: 5, id: "s", type: "SAVINGS" }],
			from,
			movements: [{ amount: 8, date: from, type: "EXPENSE" }],
			through: from,
		});
		expect(day!.accountBalance).toBe(-3);
		expect(day!.savingsBalance).toBe(0);
	});
});
test("explicit origin and ID ties preserve cents, internal transfers and later income", () => {
	const days = dailyForecast({
		accounts: [
			{ balance: 0.01, id: "a", type: "CHECKING" },
			{ balance: 0.02, id: "b", type: "CHECKING" },
			{ balance: 1, id: "s", type: "SAVINGS" },
		],
		from,
		movements: [
			{ amount: 0.5, date: from, destinationAccountId: "b", originAccountId: "s", type: "TRANSFER" },
			{ amount: 2, date: from, originAccountId: "b", type: "EXPENSE" },
			{ amount: 3, date: "2026-10-05", destinationAccountId: "b", type: "INCOME" },
		],
		primaryAccountId: "a",
		through: "2026-10-05",
	});
	expect(days[0]!.balances.get("a")).toBe(0);
	expect(days[0]!.balances.get("b")).toBeCloseTo(-0.97);
	expect(days[0]!.savingsBalance).toBe(0);
	expect(days[0]!.expenses).toBe(2);
	expect(days[1]!.totalBalance).toBeCloseTo(2.03);
});
test("explicit reserve exhaustion leaves deficit in primary, yield ties use account ID", () => {
	const [day] = dailyForecast({
		accounts: [
			{ balance: 0, id: "cash", type: "CASH" },
			{ balance: 10, id: "b", type: "SAVINGS" },
			{ balance: 10, id: "a", type: "SAVINGS" },
		],
		from,
		movements: [{ amount: 11, date: from, originAccountId: "b", type: "EXPENSE" }],
		primaryAccountId: "cash",
		through: from,
	});
	expect(day!.balances.get("b")).toBe(0);
	expect(day!.balances.get("a")).toBe(9);
	const [deficit] = dailyForecast({
		accounts: [
			{ balance: 0, id: "cash", type: "CASH" },
			{ balance: 1, id: "s", type: "SAVINGS" },
		],
		from,
		movements: [{ amount: 2, date: from, originAccountId: "s", type: "EXPENSE" }],
		primaryAccountId: "cash",
		through: from,
	});
	expect(deficit!.balances.get("cash")).toBe(-1);
	expect(deficit!.balances.get("s")).toBe(0);
});

test("monetary cashback remains consolidated while points stay excluded", () => {
	const [day] = dailyForecast({
		accounts: [
			{ balance: 12.34, id: "money", type: "CASHBACK" },
			{ balance: 500, id: "points", type: "REWARDS" },
		],
		from,
		movements: [],
		through: from,
	});
	expect(day!.accountBalance).toBe(12.34);
	expect(day!.totalBalance).toBe(12.34);
});

test("native reserves pay consolidated expense using relative factors", () => {
	const [day] = dailyForecast({
		accounts: [
			{ balance: 100, currency: "BRL", id: "brl", type: "CHECKING" },
			{ balance: 100, currency: "USD", id: "usd", type: "SAVINGS" },
		],
		currency: "BRL",
		from,
		movements: [{ amount: 200, currency: "BRL", date: from, originAccountId: "brl", type: "EXPENSE" }],
		rate: source => (source === "USD" ? 5 : 1),
		through: from,
	});
	expect(day!.balances.get("brl")).toBe(0);
	expect(day!.balances.get("usd")).toBe(80);
	expect(day!.totalBalance).toBe(400);
	expect(day!.expenses).toBe(200);
});
test("actual cross-currency transfer is preserved and native earnings consolidate", () => {
	const [day] = dailyForecast({
		accounts: [
			{ balance: 100, currency: "USD", id: "usd", type: "CHECKING" },
			{ balance: 0, currency: "JPY", id: "jpy", type: "SAVINGS" },
		],
		currency: "USD",
		from,
		movements: [
			{
				amount: 10,
				currency: "USD",
				date: from,
				destinationAccountId: "jpy",
				destinationAmount: 900,
				originAccountId: "usd",
				type: "TRANSFER",
			},
		],
		netYield: account => (account.id === "jpy" ? 10 : 0),
		rate: () => 0.01,
		through: from,
	});
	expect(day!.balances.get("usd")).toBe(90);
	expect(day!.balances.get("jpy")).toBe(910);
	expect(day!.totalBalance).toBe(99.1);
	expect(day!.income).toBe(0.1);
});
test("unavailable conversion never becomes a zero or mixed total", () => {
	expect(() =>
		dailyForecast({
			accounts: [{ balance: 100, currency: "USD", id: "usd", type: "CHECKING" }],
			currency: "BRL",
			from,
			movements: [],
			rate: () => null,
			through: from,
		}),
	).toThrow("Unavailable forecast conversion");
});

test("empty foreign accounts and zero movements need no exchange rate", () => {
	let quotes = 0;
	const days = dailyForecast({
		accounts: [
			{ balance: 0, currency: "USD", id: "usd", type: "CHECKING" },
			{ balance: 100, currency: "BRL", id: "brl", type: "CHECKING" },
		],
		currency: "BRL",
		from: "2026-10-09",
		movements: [
			{ amount: 10, currency: "BRL", date: "2026-10-09", type: "EXPENSE" },
			{ amount: 0, currency: "USD", date: "2026-10-09", type: "INCOME" },
		],
		primaryAccountId: "brl",
		rate: () => {
			quotes++;
			throw new Error("Unexpected conversion");
		},
		through: "2026-10-09",
	});
	expect(days[0]!.totalBalance).toBe(90);
	expect(quotes).toBe(0);
});
