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

	test("keeps synchronized transfers when requested", () => {
		const transactions = [
			{ externalIds: ["nubank-123"], id: "synchronized-income", type: "INCOME" },
			{ externalIds: ["nubank-456"], id: "synchronized-transfer", type: "TRANSFER" },
		];

		expect(
			filterSynchronizedTransactions(transactions, transaction => transaction.type === "TRANSFER"),
		).toEqual([{ externalIds: ["nubank-456"], id: "synchronized-transfer", type: "TRANSFER" }]);
	});
});
