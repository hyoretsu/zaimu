import type { DebtSplit, FinancialAccount, RecurringPayment, Salary, Subscription } from "@/lib/api";

export type RecurringSource = "salary" | "subscription" | "recurring";
export type RecurringDirection = "INCOME" | "EXPENSE";
export type RecurrenceFrequency = Salary["frequency"];

export interface RecurringListItemData {
	financialAccountId?: string;
	accountName?: string;
	accountType?: FinancialAccount["type"];
	active: boolean;
	amount: number;
	day: number | null;
	dayOfWeek?: number | null;
	debtSplit?: DebtSplit | null;
	direction: RecurringDirection;
	frequency: RecurrenceFrequency;
	id: string;
	monthlyAmount: number;
	endDate?: string | null;
	paymentMethod?: Subscription["paymentMethod"] | RecurringPayment["paymentMethod"];
	storeName?: string | null;
	source: RecurringSource;
	startDate: string;
	tags?: RecurringPayment["tags"] | Salary["tags"] | Subscription["tags"];
	title: string;
}

export interface RecurringDraft {
	amount: string;
	day: string;
	dayOfWeek: string;
	financialAccountId: string;
	endDate: string;
	frequency: RecurrenceFrequency;
	name: string;
	paymentMethod: Subscription["paymentMethod"];
	source: RecurringSource;
	startDate: string;
	storeName: string;
	tagIds: string[];
}
