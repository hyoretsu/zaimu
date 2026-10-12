import { expect, test } from "bun:test";
import { transactionPageDates } from "./transaction-page-dates";

test("retains a selected day without matching movements", () => {
	expect(transactionPageDates([], { endDate: "2026-08-01", startDate: "2026-08-01" })).toEqual([
		"2026-08-01",
	]);
});
test("does not fabricate days for an empty range or unfiltered list", () => {
	expect(transactionPageDates([], {})).toEqual([]);
	expect(transactionPageDates([], { endDate: "2026-08-31", startDate: "2026-08-01" })).toEqual([]);
});
test("deduplicates days and does not repeat the selected day on later pages", () => {
	expect(transactionPageDates(["2026-08-01"], { endDate: "2026-08-01", startDate: "2026-08-01" })).toEqual([
		"2026-08-01",
	]);
	expect(
		transactionPageDates([], { cursor: "next", endDate: "2026-08-01", startDate: "2026-08-01" }),
	).toEqual([]);
});
