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

export interface TransactionQueryFilters {
	categoryId?: string;
	endDate?: string;
	financialAccountId?: string;
	search?: string;
	source?: NonNullable<Transaction["source"]>;
	startDate?: string;
	type?: Transaction["type"];
	visibility?: Exclude<TransactionFilters["visibility"], "all">;
}

export function toTransactionQueryFilters(filters: TransactionFilters): TransactionQueryFilters {
	return {
		...(filters.accountId !== "all" && { financialAccountId: filters.accountId }),
		...(filters.categoryId !== "all" && { categoryId: filters.categoryId }),
		...filters.dateRange,
		...(filters.search && { search: filters.search }),
		...(filters.source !== "all" && { source: filters.source }),
		...(filters.type !== "all" && { type: filters.type }),
		...(filters.visibility !== "all" && { visibility: filters.visibility }),
	};
}

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
