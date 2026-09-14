import type { Transaction } from "@/lib/api";

export interface TransactionFilters {
	accountId: string;
	categoryId: string;
	dateRange: { endDate?: string; startDate?: string };
	search: string;
	source: "all" | NonNullable<Transaction["source"]>;
	type: "all" | Transaction["type"];
	visibility: "all" | "hidden" | "visible";
}

export const initialTransactionFilters: TransactionFilters = {
	accountId: "all",
	categoryId: "all",
	dateRange: {},
	search: "",
	source: "all",
	type: "all",
	visibility: "all",
};

export function countActiveTransactionFilters(filters: TransactionFilters) {
	return [
		Boolean(filters.search),
		Boolean(filters.dateRange.startDate || filters.dateRange.endDate),
		filters.type !== initialTransactionFilters.type,
		filters.source !== initialTransactionFilters.source,
		filters.visibility !== initialTransactionFilters.visibility,
		filters.accountId !== initialTransactionFilters.accountId,
		filters.categoryId !== initialTransactionFilters.categoryId,
	].filter(Boolean).length;
}

export function filterTransactions(transactions: Transaction[], filters: TransactionFilters) {
	const search = normalize(filters.search);

	return transactions.filter(transaction => {
		if (filters.type !== "all" && transaction.type !== filters.type) return false;
		if (filters.source !== "all" && transaction.source !== filters.source) return false;
		if (filters.visibility === "hidden" && !transaction.isHidden) return false;
		if (filters.visibility === "visible" && transaction.isHidden) return false;
		if (filters.dateRange.startDate && transaction.date.slice(0, 10) < filters.dateRange.startDate)
			return false;
		if (filters.dateRange.endDate && transaction.date.slice(0, 10) > filters.dateRange.endDate) return false;
		if (
			filters.accountId !== "all" &&
			transaction.originFinancialAccountId !== filters.accountId &&
			transaction.destinationFinancialAccountId !== filters.accountId
		)
			return false;
		if (
			filters.categoryId !== "all" &&
			!(transaction.tagIds ?? (transaction.categoryId ? [transaction.categoryId] : [])).includes(
				filters.categoryId,
			)
		)
			return false;
		return !search || normalize(getTransactionSearchText(transaction)).includes(search);
	});
}

function getTransactionSearchText(transaction: Transaction) {
	const brazilianDate = transaction.date.slice(0, 10).split("-").reverse().join("/");
	const amount = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(
		transaction.amount,
	);
	return [JSON.stringify(transaction), brazilianDate, amount].join(" ");
}

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase("pt-BR")
		.replace(/\s+/gu, " ")
		.trim();
}
