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
