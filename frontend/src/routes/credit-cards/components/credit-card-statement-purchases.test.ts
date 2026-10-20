import { expect, test } from "bun:test";
import { isVisibleStatementPurchase } from "./credit-card-statement-purchases";

test("refunds appear in the statement only when they provide credit", () => {
	for (const installmentAmount of [0, -0]) {
		expect(isVisibleStatementPurchase({ installmentAmount, isRefund: true })).toBe(false);
	}
	for (const installmentAmount of [-0.01, -23.64]) {
		expect(isVisibleStatementPurchase({ installmentAmount, isRefund: true })).toBe(true);
	}
});

test("ordinary purchases remain visible regardless of their amount", () => {
	for (const installmentAmount of [0, 22.03, -10]) {
		expect(isVisibleStatementPurchase({ installmentAmount })).toBe(true);
	}
});
