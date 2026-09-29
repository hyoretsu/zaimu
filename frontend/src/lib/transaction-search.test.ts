import { describe, expect, test } from "bun:test";
import type { Transaction } from "./api";
import { getTransactionSearchText, normalizeTransactionSearch } from "./transaction-search";

const transaction: Transaction = {
	amount: 18.02,
	createdAt: "2026-09-19T21:51:00.000Z",
	date: "2026-09-19T00:00:00.000Z",
	debtSplit: {
		mode: "SHARES",
		ownerAmount: 0,
		ownerShares: null,
		participants: [
			{ amount: 18.02, debtPersonId: "person-1", debtPersonName: "Vitória", description: "Mag", shares: 1 },
		],
	},
	description: "Casa de Vitória",
	id: "transaction-1",
	originName: "Cartão Mercado Pago",
	storeName: "Loja Uber",
	time: "21:51:00",
	type: "EXPENSE",
};

describe("transaction search", () => {
	test("finds formatted amount, date, time, account, store and debt details", () => {
		const text = getTransactionSearchText(transaction);
		for (const query of [
			"18,02",
			"R$ 18,02",
			"19/09/2026",
			"2026-09-19",
			"21:51",
			"Mercado Pago",
			"Uber",
			"Dívida Vitória",
			"Mag",
		])
			expect(text.includes(normalizeTransactionSearch(query))).toBe(true);
	});
});
