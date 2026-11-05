import { expect, test } from "bun:test";
import { DashboardConversionUnavailable, dashboardCurrencyContext } from "./dashboard-currency-context";
import type { loadDashboardData } from "./load-dashboard-data";

const loaded = () =>
	({
		accounts: [{ currency: "USD", id: "usd", type: "CHECKING" }],
		balanceRows: [
			{ accountId: "usd", balance: 100, date: "2026-10-06" },
			{ accountId: "usd", balance: 120, date: "2026-10-08" },
		],
		cards: [],
		debts: [],
		flows: [{ amount: 20, currency: "USD", date: new Date("2026-10-06T12:00:00") }],
		loanPayments: [],
		recurrences: [],
	}) as unknown as Awaited<ReturnType<typeof loadDashboardData>>;
const today = new Date("2026-10-08T12:00:00");
test("multiple holdings in one container are converted before addition and missing quotes reject all", async () => {
	const data = loaded();
	data.accounts[0]!.currency = "BRL";
	data.flows = [];
	data.balanceRows = [
		{ accountId: "usd", assetCode: "BTC", balance: "0.000000000000000001", date: "2026-10-08" },
		{ accountId: "usd", assetCode: "USD", balance: "10", date: "2026-10-08" },
	];
	const dependencies = {
		assetConvert: async (amount: string, source: string) => {
			if (source === "BTC") expect(amount).toBe("0.000000000000000001");
			return source === "BTC" ? "2.50" : "50.00";
		},
		estimate: async () => null,
		historical: async () => 1,
		latest: async () => ({ date: "2026-10-08", rate: 1 }),
		request: async () => null,
	};
	const context = await dashboardCurrencyContext(data, "BRL", today, false, dependencies);
	expect(context.assetBalances.get("usd:2026-10-08")).toBe(52.5);
	await expect(
		dashboardCurrencyContext(data, "BRL", today, false, {
			...dependencies,
			assetConvert: async (_amount, source) => {
				if (source === "USD") throw new Error("missing quote");
				return "2.50";
			},
		}),
	).rejects.toBeInstanceOf(DashboardConversionUnavailable);
});
test("native gas and forecast rows convert decimal strings using their financial date", async () => {
	const data = loaded();
	data.balanceRows = [];
	data.flows = [
		{
			amount: "0.000000000000000001",
			currency: "ETH",
			date: new Date("2026-10-06T12:00:00"),
			type: "EXPENSE",
		},
	] as unknown as typeof data.flows;
	data.forecastTransactions = [
		{
			amount: "0.000000000000000002",
			currency: "BTC",
			date: new Date("2026-10-07T12:00:00"),
			type: "EXPENSE",
		},
	] as unknown as typeof data.forecastTransactions;
	const calls: string[] = [];
	await dashboardCurrencyContext(data, "BRL", today, false, {
		assetConvert: async (amount, source, target, date) => {
			calls.push(`${amount}:${source}:${target}:${date}`);
			return "12.34";
		},
		estimate: async () => null,
		historical: async () => 1,
		latest: async () => ({ date: "2026-10-08", rate: 1 }),
		request: async () => null,
	});
	expect(calls).toEqual([
		"0.000000000000000001:ETH:BRL:2026-10-06",
		"0.000000000000000002:BTC:BRL:2026-10-07",
	]);
	expect(data.flows[0]!.amount).toBe(12.34);
	expect(data.forecastTransactions[0]!.amount).toBe(12.34);
});
test("historical positions use exact event date, current positions preserve publication date", async () => {
	let requested = 0;
	const context = await dashboardCurrencyContext(loaded(), "BRL", today, false, {
		estimate: async () => null,
		historical: async date => {
			expect(date).toBe("2026-10-06");
			return 5;
		},
		latest: async () => ({ date: "2026-10-07", rate: 6 }),
		request: async () => {
			requested++;
			return null;
		},
	});
	expect(context.convert(100, "USD", "2026-10-06")).toBe(500);
	expect(context.convert(120, "USD", "2026-10-08")).toBe(720);
	expect(context.publishedDates.USD).toBe("2026-10-07");
	expect(requested).toBe(0);
	expect(() => context.convert(10, "USD", "2026-10-09")).toThrow(DashboardConversionUnavailable);
});
test("forecast demand requests both bases and no samples leave forecast unavailable", async () => {
	const requested: string[][] = [];
	const context = await dashboardCurrencyContext(loaded(), "BRL", today, true, {
		estimate: async () => null,
		historical: async () => 5,
		latest: async () => ({ date: "2026-10-08", rate: 5 }),
		request: async (_kind, series, date) => {
			requested.push(series);
			expect(date).toBe("2026-10-08");
			return null;
		},
	});
	expect(requested).toEqual([["USD", "BRL"]]);
	expect(context.forecastAvailable).toBe(false);
	expect(context.convert(10, "USD", "2026-10-08")).toBe(50);
});
test("provider failure cannot become a zero or an unrelated available currency", async () => {
	const context = await dashboardCurrencyContext(loaded(), "BRL", today, false, {
		estimate: async () => null,
		historical: async () => {
			throw new Error("offline");
		},
		latest: async () => {
			throw new Error("offline");
		},
		request: async () => null,
	});
	expect(context.convert(10, "BRL")).toBe(10);
	expect(context.convert(0, "USD")).toBe(0);
	expect(() => context.convert(10, "USD")).toThrow(DashboardConversionUnavailable);
	expect(context.missing).toContain("USD:2026-10-08");
});

for (const foreignAmount of [0, 20])
	test(`only actual historical demand requests FX (foreign amount ${foreignAmount})`, async () => {
		const data = loaded();
		data.accounts = [];
		data.balanceRows = [];
		data.flows = Array.from({ length: 1000 }, () => ({
			amount: 10,
			currency: "BRL",
			date: today,
			type: "EXPENSE",
		}));
		data.flows.push(
			...Array.from({ length: 2 }, () => ({
				amount: foreignAmount,
				currency: "USD",
				date: new Date("2026-10-01T12:00:00"),
				type: "EXPENSE",
			})),
		);
		const dates: string[] = [];
		const context = await dashboardCurrencyContext(data, "BRL", today, true, {
			estimate: async () => {
				throw new Error("Unexpected estimate");
			},
			historical: async date => {
				dates.push(String(date));
				return 5;
			},
			latest: async () => {
				throw new Error("Unexpected latest quote");
			},
			request: async () => {
				throw new Error("Unexpected forecast collection");
			},
		});
		expect(dates).toEqual(foreignAmount ? ["2026-10-01"] : []);
		expect(context.missing).toEqual([]);
		expect(context.publishedDates).toEqual({});
		expect(context.forecastAvailable).toBe(true);
		expect(context.convert(foreignAmount, "USD", "2026-10-01")).toBe(foreignAmount * 5);
	});

test("out-of-range foreign movements need neither current quotes nor forecast history", async () => {
	const data = loaded();
	data.accounts = [];
	data.balanceRows = [];
	data.flows = [{ amount: 20, currency: "USD", date: new Date("2027-01-01T12:00:00"), type: "EXPENSE" }];
	const context = await dashboardCurrencyContext(
		data,
		"BRL",
		today,
		true,
		{
			estimate: async () => {
				throw new Error("Unexpected estimate");
			},
			historical: async () => {
				throw new Error("Unexpected historical quote");
			},
			latest: async () => {
				throw new Error("Unexpected latest quote");
			},
			request: async () => {
				throw new Error("Unexpected forecast request");
			},
		},
		"2026-10-31",
	);
	expect(context.missing).toEqual([]);
	expect(context.forecastAvailable).toBe(true);
});

test("overdue foreign invoices request FX only when a monthly plan reserves them", async () => {
	const data = loaded();
	data.accounts = [];
	data.balanceRows = [];
	data.flows = [];
	data.cards = [{ creditLimit: 0, currency: "USD", id: "card" }] as typeof data.cards;
	data.projectedStatements = [
		{
			balanceAmount: 100,
			calculatedTotalAmount: 100,
			chargesAmount: 0,
			creditCardId: "card",
			dueDate: new Date("2026-10-02T12:00:00"),
			id: "overdue",
			paidAmount: 0,
			statementDate: new Date("2026-09-20T12:00:00"),
			totalAmount: 100,
		},
	];
	const requests: string[][] = [];
	let historical = 0;
	const dependencies = {
		estimate: async () => null,
		historical: async () => {
			historical++;
			return 5;
		},
		latest: async () => ({ date: "2026-10-08", rate: 5 }),
		request: async (_kind: string, series: string[]) => {
			requests.push(series);
			return null;
		},
	};
	await dashboardCurrencyContext(data, "BRL", today, true, dependencies, "2026-10-31");
	expect(requests).toEqual([]);
	expect(historical).toBe(0);
	data.monthlyBudgets = [
		{
			amount: 8500,
			categoryId: null,
			currency: "BRL",
			endMonth: null,
			id: "invoice",
			name: "Faturas",
			source: "STATEMENTS",
			startMonth: "2026-10",
		},
	];
	await dashboardCurrencyContext(data, "BRL", today, true, dependencies, "2026-10-31");
	expect(requests).toEqual([["USD", "BRL"]]);
	expect(historical).toBe(1);
});

for (const mode of ["hit", "miss", "failure"])
	test(`historical batch ${mode} preserves conversion and publication date`, async () => {
		let fallback = 0;
		let batches = 0;
		const context = await dashboardCurrencyContext(loaded(), "BRL", today, false, {
			estimate: async () => null,
			historical: async () => {
				fallback++;
				return 5;
			},
			historicalMany: async requests => {
				batches++;
				expect(requests).toEqual([{ date: "2026-10-06", source: "USD" }]);
				if (mode === "failure") throw new Error("offline");
				return new Map(mode === "hit" ? [["USD:2026-10-06", 5]] : []);
			},
			latest: async () => ({ date: "2026-10-07", rate: 6 }),
			request: async () => null,
		});
		expect(batches).toBe(1);
		expect(fallback).toBe(mode === "hit" ? 0 : 1);
		expect(context.convert(100, "USD", "2026-10-06")).toBe(500);
		expect(context.convert(120, "USD", "2026-10-08")).toBe(720);
		expect(context.publishedDates.USD).toBe("2026-10-07");
	});
