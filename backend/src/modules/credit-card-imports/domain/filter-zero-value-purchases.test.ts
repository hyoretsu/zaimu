import { expect, test } from "bun:test";
import { filterZeroValuePurchases } from "./filter-zero-value-purchases";

test("removes purchases with a zero installment or total", () => {
	expect(
		filterZeroValuePurchases([
			{ id: "installment-zero", installmentAmount: 0, totalAmount: 50 },
			{ id: "total-zero", installmentAmount: 50, totalAmount: 0 },
			{ id: "purchase", installmentAmount: 50, totalAmount: 50 },
		]),
	).toEqual([{ id: "purchase", installmentAmount: 50, totalAmount: 50 }]);
});
