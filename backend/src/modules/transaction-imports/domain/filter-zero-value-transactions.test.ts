import { expect, test } from "bun:test";
import { filterZeroValueTransactions } from "./filter-zero-value-transactions";

test("removes zero-value transactions", () => {
	expect(
		filterZeroValueTransactions([
			{ amount: -10, id: "expense" },
			{ amount: 0, id: "zero" },
			{ amount: 10, id: "income" },
		]),
	).toEqual([
		{ amount: -10, id: "expense" },
		{ amount: 10, id: "income" },
	]);
});
