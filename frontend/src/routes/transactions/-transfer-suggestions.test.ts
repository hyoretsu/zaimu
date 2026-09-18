import { describe, expect, test } from "bun:test";
import type { Transaction } from "@/lib/api";
import { getTransferSuggestions } from "./-transfer-suggestions";

const expense: Transaction = {
	amount: 1,
	createdAt: "2026-09-17T12:00:00.000Z",
	date: "2026-09-17",
	id: "expense",
	originFinancialAccountId: "account-a",
	type: "EXPENSE",
};

const income: Transaction = {
	amount: 1,
	createdAt: "2026-09-17T12:00:00.000Z",
	date: "2026-09-17",
	destinationFinancialAccountId: "account-b",
	id: "income",
	type: "INCOME",
};

describe("getTransferSuggestions", () => {
	test("suggests opposite movements between different accounts", () => {
		expect(getTransferSuggestions([expense, income])).toEqual([
			{ counterpart: income, transaction: expense },
		]);
	});

	test("does not suggest a credit-card purchase and its refund without account movements", () => {
		expect(
			getTransferSuggestions([
				{ ...expense, originFinancialAccountId: undefined },
				{ ...income, destinationFinancialAccountId: undefined },
			]),
		).toEqual([]);
	});

	test("does not suggest opposite movements in the same account", () => {
		expect(
			getTransferSuggestions([expense, { ...income, destinationFinancialAccountId: "account-a" }]),
		).toEqual([]);
	});
});
