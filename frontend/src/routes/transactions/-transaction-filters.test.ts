import { describe, expect, test } from "bun:test";
import type { Transaction } from "@/lib/api";
import { filterTransactions, initialTransactionFilters } from "./-transaction-filters";

const transactions: Transaction[] = [
	{
		amount: 42.5,
		categoryId: "food",
		categoryName: "Alimentação",
		createdAt: "2026-09-14T12:00:00.000Z",
		date: "2026-09-14",
		description: "Almoço no café",
		destinationFinancialAccountId: "wallet",
		id: "income",
		originFinancialAccountId: "nubank",
		originName: "Nubank",
		tagIds: ["food"],
		type: "EXPENSE",
	},
	{
		amount: 100,
		createdAt: "2026-09-15T12:00:00.000Z",
		date: "2026-09-15",
		destinationFinancialAccountId: "wallet",
		destinationName: "Carteira",
		id: "transfer",
		isHidden: true,
		originFinancialAccountId: "nubank",
		source: "FINANCIAL_ACCOUNT",
		type: "TRANSFER",
	},
];

describe("filterTransactions", () => {
	test("searches every transaction value, including localized date and amount", () => {
		expect(
			filterTransactions(transactions, { ...initialTransactionFilters, search: "14/09/2026" }),
		).toHaveLength(1);
		expect(
			filterTransactions(transactions, { ...initialTransactionFilters, search: "R$ 42,50" }),
		).toHaveLength(1);
		expect(
			filterTransactions(transactions, { ...initialTransactionFilters, search: "alimentacao" }),
		).toHaveLength(1);
	});

	test("combines date, account, type and visibility filters", () => {
		const result = filterTransactions(transactions, {
			...initialTransactionFilters,
			accountId: "wallet",
			dateRange: { startDate: "2026-09-15" },
			type: "TRANSFER",
			visibility: "hidden",
		});
		expect(result.map(transaction => transaction.id)).toEqual(["transfer"]);
	});
});
