import { describe, expect, test } from "bun:test";
import {
	currencyWindow,
	type HistoryUnit,
	historyProgress,
	retryDelay,
	weightedCurrencyRate,
	windowDays,
} from "./collection";

const unit = (state: HistoryUnit["state"]): HistoryUnit => ({
	attempts: 1,
	endDate: "2026-01-01",
	generation: 0,
	id: state,
	kind: "CURRENCY",
	series: "USD",
	startDate: "2026-01-01",
	state,
	updatedAt: "2026-01-02T00:00:00Z",
});
describe("durable history coverage", () => {
	test("365-day window excludes reference day and respects leap years", () => {
		const window = currencyWindow("2024-03-01");
		expect(windowDays(window.startDate, window.endDate)).toHaveLength(365);
		expect(window.endDate).toBe("2024-02-29");
	});
	test("no publication counts as completed interest coverage, never fake FX data", () => {
		expect(historyProgress("INTEREST", [unit("COMPLETED"), unit("NO_DATA")])).toMatchObject({
			completed: 2,
			state: "COMPLETED",
		});
		expect(historyProgress("CURRENCY", [unit("COMPLETED"), unit("NO_DATA")])).toMatchObject({
			completed: 1,
			state: "COMPLETED_WITH_GAPS",
			unavailable: 1,
		});
	});
	test("partial work and failures retain progress and resumability", () => {
		expect(historyProgress("CURRENCY", [unit("COMPLETED"), unit("PENDING")])).toMatchObject({
			completed: 1,
			state: "RUNNING",
		});
		expect(historyProgress("CURRENCY", [unit("COMPLETED"), unit("FAILED")])).toMatchObject({
			canRetry: true,
			completed: 1,
			state: "COMPLETED_WITH_GAPS",
		});
		expect(retryDelay(1, 120_000, () => 0)).toBe(120_000);
	});
	test("weights recent history, excludes future/outside-window data", () => {
		const rate = weightedCurrencyRate(
			[
				{ date: "2026-01-01", rate: 2 },
				{ date: "2026-04-01", rate: 4 },
				{ date: "2027-01-01", rate: 100 },
				{ date: "2024-01-01", rate: 100 },
			],
			"2026-04-02",
		);
		expect(rate.samples).toBe(2);
		expect(rate.rate!).toBeCloseTo(10 / 3, 8);
	});
});

test("overlapping shared interest units count only requested window coverage", () => {
	const shared = {
		...unit("COMPLETED"),
		endDate: "2026-01-10",
		kind: "INTEREST" as const,
		series: "CDI",
		startDate: "2026-01-01",
	};
	expect(
		historyProgress("INTEREST", [shared], { endDate: "2026-01-05", startDate: "2026-01-03" }),
	).toMatchObject({ completed: 1, coveredDays: 3, requestedDays: 3, state: "COMPLETED", total: 1 });
});
