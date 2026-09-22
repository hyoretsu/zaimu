import { describe, expect, test } from "bun:test";
import { filterSynchronizedTransactions } from "./filter-synchronized-transactions";

describe("filterSynchronizedTransactions", () => {
	test("excludes transactions already linked to a statement entry", () => {
		const transactions = [
			{ externalIds: [], id: "manual" },
			{ externalIds: ["mercado-pago-123"], id: "synchronized" },
		];

		expect(filterSynchronizedTransactions(transactions)).toEqual([{ externalIds: [], id: "manual" }]);
	});
});
