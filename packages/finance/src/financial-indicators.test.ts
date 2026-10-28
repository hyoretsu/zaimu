import { describe, expect, test } from "bun:test";
import {
	civilDate,
	composedRateFactor,
	fiveYearIndicatorProjection,
	shiftMonths,
} from "./financial-indicators";
describe("shared financial indicators", () => {
	test("rejects normalized invalid dates and preserves month anchors", () => {
		expect(() => civilDate("2026-02-30")).toThrow();
		expect(shiftMonths("2024-01-31", 1)).toBe("2024-02-29");
		expect(shiftMonths("2024-01-31", 2)).toBe("2024-03-31");
	});
	test("compounds index and spread and permits deflation", () => {
		expect(composedRateFactor({ fixedRate: 1, indicator: "IPCA", percentage: 100 }, -0.5, 1)).toBeCloseTo(
			0.995 * 1.01,
		);
		expect(() => composedRateFactor({ indicator: "IPCA", percentage: 100 }, null, 1)).toThrow();
	});
	test("five years use geometric monthly factors, ignoring older and future observations", () => {
		const rows = Array.from({ length: 60 }, (_, index) => ({
			date: shiftMonths("2021-01-01", index),
			value: index % 2 ? -0.5 : 1,
		}));
		const result = fiveYearIndicatorProjection(
			"IPCA",
			[...rows, { date: "2020-01-01", value: 99 }],
			"2025-12-31",
		);
		expect(result.complete).toBe(true);
		expect(result.observations).toBe(60);
		expect(result.periodRate).toBeCloseTo((Math.sqrt(1.01 * 0.995) - 1) * 100);
		expect(fiveYearIndicatorProjection("IPCA", rows.slice(5), "2025-12-31").complete).toBe(false);
	});
	test("TR daily publication is not daily accrual", () => {
		const rows = Array.from({ length: 60 }, (_, index) => ({
			date: shiftMonths("2021-01-01", index),
			value: 0.2,
		}));
		const result = fiveYearIndicatorProjection(
			"TR",
			[...rows, { date: "2025-12-02", value: 90 }],
			"2025-12-31",
		);
		expect(result.observations).toBe(60);
		expect(result.periodRate).toBeCloseTo(0.2);
	});
});

test("monthly indices convert to native account accrual without treating publication as daily interest", async () => {
	const { indicatorDailyRate, financialReferenceResolver } = await import("./financial-indicators");
	expect((1 + indicatorDailyRate("IPCA", 0.5, 100)) ** 21).toBeCloseTo(1.005, 10);
	expect(indicatorDailyRate("IPCA", -0.5, 100)).toBeLessThan(0);
	const resolve = financialReferenceResolver({
		observations: { IPCA: [{ date: "2026-01-01", value: 0.5 }] },
		projections: [
			{
				complete: true,
				coverageEnd: "2026-01-01",
				coverageStart: "2021-02-01",
				from: "2021-02-01",
				indicator: "IPCA",
				observations: 60,
				periodRate: 0.4,
				through: "2026-02-01",
			},
		],
	});
	expect(resolve({ indicator: "IPCA", lagMonths: 1, percentage: 100 }, "2026-01-01", "2026-02-01")).toBe(
		0.5,
	);
	expect(resolve({ indicator: "IPCA", percentage: 100 }, "2026-02-01", "2026-03-01")).toBe(0.4);
});
