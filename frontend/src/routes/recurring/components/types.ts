import type { DebtSplit, FinancialAccount, Tag } from "@/lib/api";
import type { Recurrence } from "@/lib/recurrence";

export type RecurringSource = "recurring";
export type RecurringDirection = "INCOME" | "EXPENSE" | "TRANSFER";

export interface RecurringListItemData {
	recurrence?: Recurrence;
	financialAccountId?: string;
	destinationName?: string;
	destinationAccountType?: FinancialAccount["type"];
	accountName?: string;
	accountType?: FinancialAccount["type"];
	active: boolean;
	amount: number;
	day?: number | null;
	dayOfMonth?: number | null;
	unit?: Recurrence["unit"];
	interval?: number;
	movement?: Recurrence["movement"];
	dayOfWeek?: number | null;
	debtSplit?: DebtSplit | null;
	direction: RecurringDirection;
	frequency?: string;
	id: string;
	monthlyAmount: number;
	endDate?: string | null;
	paymentMethod?: "DEBIT" | "CREDIT" | "PIX" | "CASH" | "TRANSFER" | "BOLETO";
	storeName?: string | null;
	source?: string;
	startDate: string;
	tags?: Tag[];
	title: string;
}
