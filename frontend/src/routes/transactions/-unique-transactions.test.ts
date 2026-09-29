import { describe, expect, test } from "bun:test";
import { uniqueTransactions } from "./-unique-transactions";

describe("uniqueTransactions", () => {
	test("shows a transaction once when adjacent pages contain the same record", () => {
		const purchase = { id: "purchase", title: "Comida mexicana" };
		const repeated = { ...purchase, title: "Comida mexicana editada" };
		expect(uniqueTransactions([[purchase], [repeated, { id: "other", title: "Outra compra" }]])).toEqual([
			purchase,
			{ id: "other", title: "Outra compra" },
		]);
	});
});
