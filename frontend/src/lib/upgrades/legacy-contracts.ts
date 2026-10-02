import type { DebtSplit, Tag } from "../api";
export interface Salary {
	id: string;
	userId: string;
	financialAccountId?: string | null;
	source: string;
	amount: number;
	frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
	payDay: number;
	dayOfWeek?: number | null;
	startDate: string;
	autoGenerateFrom: string;
	endDate?: string | null;
	isActive: boolean;
	categoryId?: string;
	tagIds?: string[];
	tags?: Tag[];
}

export interface Subscription {
	id: string;
	userId: string;
	name: string;
	amount: number;
	debtSplit?: DebtSplit | null;
	billingDay: number;
	dayOfWeek?: number | null;
	frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
	paymentMethod: "DEBIT" | "CREDIT" | "PIX" | "CASH" | "TRANSFER" | "BOLETO";
	financialAccountId?: string | null;
	storeName?: string | null;
	startDate: string;
	endDate?: string | null;
	isActive: boolean;
	categoryId?: string;
	tagIds?: string[];
	tags?: Tag[];
}

export interface RecurringPayment {
	id: string;
	userId: string;
	name: string;
	amount: number;
	debtSplit?: DebtSplit | null;
	frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
	dayOfMonth?: number;
	dayOfWeek?: number | null;
	startDate: string;
	endDate?: string | null;
	categoryId?: string;
	paymentMethod: "DEBIT" | "CREDIT" | "PIX" | "CASH" | "TRANSFER" | "BOLETO";
	financialAccountId?: string | null;
	storeName?: string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	category?: string;
	tagIds?: string[];
	tags?: Tag[];
	day?: number;
	type?: "INCOME" | "EXPENSE";
}
