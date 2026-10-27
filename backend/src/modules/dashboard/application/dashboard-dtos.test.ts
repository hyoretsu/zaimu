import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { DashboardComparisonQuery } from "./dashboard-dtos";

test("comparison accepts counts above the former maximum and rejects invalid counts", () => {
	expect(Value.Check(DashboardComparisonQuery, { periodsAfter: 120, periodsBefore: 100 })).toBe(true);
	for (const value of [-1, 1.5, Number.POSITIVE_INFINITY]) {
		expect(Value.Check(DashboardComparisonQuery, { periodsAfter: value })).toBe(false);
		expect(Value.Check(DashboardComparisonQuery, { periodsBefore: value })).toBe(false);
	}
});
