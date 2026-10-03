import { expect, test } from "bun:test";
import {
	buildComparisonPeriods,
	comparisonRangeEnd,
	databaseDate,
	dateKey,
	endingBalanceAtPeriodEnd,
	nextOccurrence,
	occurrencesInRange,
	projectedCashFlowUntilMonthEnd,
	reconcilePeriodCashFlow,
	resolveDashboardRange,
} from "./dashboard-calculations";

test("preserves database date-only values in the local calendar", () => {
	expect(dateKey(databaseDate(new Date("2026-09-05T00:00:00.000Z")))).toBe("2026-09-05");
});

test("reconciles yields and boundary movements with the displayed cash flow", () => {
	expect(
		reconcilePeriodCashFlow({ endingBalance: 214, expenses: 40, income: 50, initialBalance: 200 }),
	).toEqual({ expenses: 40, income: 54 });
	expect(
		reconcilePeriodCashFlow({ endingBalance: 205, expenses: 40, income: 50, initialBalance: 200 }),
	).toEqual({ expenses: 45, income: 50 });
});

test("finds next occurrence without materializing it", () => {
	const occurrence = nextOccurrence({
		dayOfMonth: 31,
		frequency: "MONTHLY",
		from: new Date("2026-02-01T00:00:00"),
		startDate: new Date("2026-01-31T00:00:00"),
	});
	expect(occurrence?.toISOString().slice(0, 10)).toBe("2026-02-28");
});

test("stops an ended schedule and keeps inclusive dates", () => {
	expect(
		nextOccurrence({
			endDate: new Date("2026-02-02T00:00:00"),
			frequency: "DAILY",
			from: new Date("2026-02-02T00:00:00"),
			startDate: new Date("2026-02-01T00:00:00"),
		})
			?.toISOString()
			.slice(0, 10),
	).toBe("2026-02-02");
	expect(
		nextOccurrence({
			endDate: new Date("2026-02-02T00:00:00"),
			frequency: "DAILY",
			from: new Date("2026-02-03T00:00:00"),
			startDate: new Date("2026-02-01T00:00:00"),
		}),
	).toBeUndefined();
});

test("lists every recurrence inside a projection range", () => {
	const occurrences = occurrencesInRange({
		dayOfMonth: 31,
		frequency: "MONTHLY",
		from: new Date("2026-01-01T00:00:00"),
		startDate: new Date("2026-01-31T00:00:00"),
		through: new Date("2026-04-01T00:00:00"),
	});
	expect(occurrences.map(item => item.toISOString().slice(0, 10))).toEqual([
		"2026-01-31",
		"2026-02-28",
		"2026-03-31",
	]);
});

test("aligns weekly recurrences to their configured weekday", () => {
	const occurrence = nextOccurrence({
		dayOfWeek: 1,
		frequency: "WEEKLY",
		from: new Date("2026-03-01T00:00:00"),
		startDate: new Date("2026-03-01T00:00:00"),
	});
	expect(occurrence?.toISOString().slice(0, 10)).toBe("2026-03-02");
});

test("does not schedule a weekly payment before its start date when weekday differs", () => {
	const occurrences = occurrencesInRange({
		dayOfWeek: 1,
		frequency: "WEEKLY",
		from: new Date("2026-09-18T00:00:00"),
		startDate: new Date("2026-09-18T00:00:00"),
		through: new Date("2026-10-06T00:00:00"),
	});
	expect(occurrences.map(item => item.toISOString().slice(0, 10))).toEqual([
		"2026-09-21",
		"2026-09-28",
		"2026-10-05",
	]);
});

test("builds twelve monthly comparison intervals across year boundaries", () => {
	const base = resolveDashboardRange("2026-03-01", "2026-03-31", new Date("2026-03-10T00:00:00"));
	const periods = buildComparisonPeriods({ base, initialBalance: 100, transactions: [] });
	expect(periods).toHaveLength(12);
	expect(periods[0]?.endDate).toBe("2026-02-28");
	expect(periods[1]?.startDate).toBe("2026-03-01");
	expect(periods[11]?.startDate).toBe("2027-01-01");
	expect(periods[11]?.endDate).toBe("2027-01-31");
});

test("keeps annual dashboard ranges as twelve individual chart months", () => {
	const base = resolveDashboardRange("2026-01-01", "2026-12-31");
	const periods = buildComparisonPeriods({ base, initialBalance: 0, transactions: [] });
	expect(periods).toHaveLength(12);
	expect(periods[0]).toMatchObject({ endDate: "2025-12-31", startDate: "2025-12-01" });
	expect(periods[1]).toMatchObject({ endDate: "2026-01-31", startDate: "2026-01-01" });
	expect(periods[11]?.endDate).toBe("2026-11-30");
	expect(dateKey(comparisonRangeEnd(base))).toBe("2026-11-30");
});

test("uses complete months and anchors balances to the selected period", () => {
	const base = resolveDashboardRange("2026-03-14", "2026-03-14", new Date("2026-03-14T00:00:00"));
	const periods = buildComparisonPeriods({
		base,
		initialBalance: 1_100,
		transactions: [
			{ amount: 100, date: new Date("2026-03-02T12:00:00"), type: "INCOME" },
			{ amount: 50, date: new Date("2026-03-10T12:00:00"), type: "EXPENSE" },
			{ amount: 200, date: new Date("2026-04-01T12:00:00"), type: "EXPENSE" },
		],
	});
	expect(periods[1]).toMatchObject({
		endDate: "2026-03-31",
		endingBalance: 1_100,
		initialBalance: 1_050,
		startDate: "2026-03-01",
	});
	expect(periods[2]).toMatchObject({ endingBalance: 900, initialBalance: 1_100, startDate: "2026-04-01" });
});

test("does not apply future projections to a historical period balance", () => {
	const endingBalance = endingBalanceAtPeriodEnd({
		currentBalance: 1_000,
		periodEnd: new Date("2026-07-31T23:59:59"),
		today: new Date("2026-08-03T12:00:00"),
		transactions: [
			{ amount: 300, date: new Date("2026-08-03T00:00:00"), type: "EXPENSE" },
			{ amount: 500, date: new Date("2026-08-20T00:00:00"), type: "EXPENSE" },
		],
	});
	expect(endingBalance).toBe(1_300);
});

test("adds scheduled movements through a future period end", () => {
	const endingBalance = endingBalanceAtPeriodEnd({
		currentBalance: 1_000,
		periodEnd: new Date("2026-08-31T23:59:59"),
		today: new Date("2026-08-03T12:00:00"),
		transactions: [
			{ amount: 500, date: new Date("2026-08-20T00:00:00"), type: "EXPENSE" },
			{ amount: 700, date: new Date("2026-09-05T00:00:00"), type: "INCOME" },
		],
	});
	expect(endingBalance).toBe(500);
});

test("keeps the current balance when the period ends today", () => {
	expect(
		endingBalanceAtPeriodEnd({
			currentBalance: 1_000,
			periodEnd: new Date("2026-08-03T23:59:59"),
			today: new Date("2026-08-03T12:00:00"),
			transactions: [{ amount: 300, date: new Date("2026-08-03T00:00:00"), type: "EXPENSE" }],
		}),
	).toBe(1_000);
});

test("calculates projected cash flow through the current month end", () => {
	expect(
		projectedCashFlowUntilMonthEnd({
			today: new Date("2026-08-03T12:00:00"),
			transactions: [
				{ amount: 100, date: new Date("2026-08-03T12:00:00"), type: "EXPENSE" },
				{ amount: 200, date: new Date("2026-08-20T12:00:00"), type: "EXPENSE" },
				{ amount: 300, date: new Date("2026-08-31T12:00:00"), type: "EXPENSE" },
				{ amount: 400, date: new Date("2026-09-01T12:00:00"), type: "EXPENSE" },
				{ amount: 500, date: new Date("2026-08-15T12:00:00"), type: "INCOME" },
			],
		}),
	).toEqual({ expenses: 500, income: 500, net: 0 });
});

test("custom comparison assigns boundary transactions exactly once and rolls balances forward", () => {
	const base = resolveDashboardRange("2026-10-03", "2026-10-16");
	const options = { comparisonSize: 2, comparisonUnit: "WEEK" as const, periodsAfter: 1, periodsBefore: 1 };
	const periods = buildComparisonPeriods({
		...options,
		base,
		initialBalance: 100,
		transactions: [
			{ amount: 20, date: new Date("2026-10-02T23:59:59"), type: "INCOME" },
			{ amount: 30, date: new Date("2026-10-03T00:00:00"), type: "EXPENSE" },
			{ amount: 50, date: new Date("2026-10-16T23:59:59"), type: "INCOME" },
			{ amount: 10, date: new Date("2026-10-17T00:00:00"), type: "EXPENSE" },
		],
	});
	expect(periods).toHaveLength(3);
	expect(periods[0]).toMatchObject({ endingBalance: 100, income: 20, initialBalance: 80 });
	expect(periods[1]).toMatchObject({ endingBalance: 120, expenses: 30, income: 50, initialBalance: 100 });
	expect(periods[2]).toMatchObject({ endingBalance: 110, expenses: 10, initialBalance: 120 });
	expect(dateKey(comparisonRangeEnd(base, options))).toBe("2026-10-30");
});
