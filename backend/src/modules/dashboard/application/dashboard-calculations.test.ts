import { expect, test } from "bun:test";
import {
	buildComparisonPeriods,
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

test("builds thirteen contiguous inclusive comparison intervals", () => {
	const base = resolveDashboardRange("2026-03-01", "2026-03-31", new Date("2026-03-10T00:00:00"));
	const periods = buildComparisonPeriods({ base, initialBalance: 100, transactions: [] });
	expect(periods).toHaveLength(13);
	expect(periods[0]?.endDate).toBe("2025-09-30");
	expect(periods[6]?.startDate).toBe("2026-03-01");
	expect(periods[12]?.startDate).toBe("2026-09-01");
	expect(periods[12]?.endDate).toBe("2026-09-30");
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
