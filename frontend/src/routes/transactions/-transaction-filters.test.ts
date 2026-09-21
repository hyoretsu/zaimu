import { describe, expect, test } from "bun:test";
import {
	countActiveTransactionFilters,
	initialTransactionFilters,
	toTransactionQueryFilters,
} from "./-transaction-filters";

describe("transaction filters", () => {
	test("counts each non-default filter once, including a date range", () => {
		expect(countActiveTransactionFilters(initialTransactionFilters)).toBe(0);
		expect(
			countActiveTransactionFilters({
				...initialTransactionFilters,
				dateRange: { endDate: "2026-09-30", startDate: "2026-09-01" },
				search: "café",
				type: "EXPENSE",
			}),
		).toBe(3);
	});

	test("maps every active filter to query parameters", () => {
		expect(
			toTransactionQueryFilters({
				...initialTransactionFilters,
				accountId: "account-id",
				categoryId: "category-id",
				dateRange: { endDate: "2026-09-30", startDate: "2026-09-01" },
				search: "café",
				source: "CREDIT_CARD",
				type: "EXPENSE",
				visibility: "hidden",
			}),
		).toEqual({
			categoryId: "category-id",
			endDate: "2026-09-30",
			financialAccountId: "account-id",
			search: "café",
			source: "CREDIT_CARD",
			startDate: "2026-09-01",
			type: "EXPENSE",
			visibility: "hidden",
		});
	});
});
