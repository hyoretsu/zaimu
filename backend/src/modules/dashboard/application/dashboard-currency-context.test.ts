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
