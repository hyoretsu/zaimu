import type { RecurrenceDefinition } from "@zaimu/finance/recurrence";
import type { DebtSplit, DebtSplitInput, Tag } from "./api";
export interface Recurrence extends RecurrenceDefinition {
	needsConfiguration?: boolean;
	tags?: Tag[];
	tagIds?: string[];
	debtSplit?: DebtSplit | null;
}
export type RecurrenceInput = Omit<
	Recurrence,
	| "id"
	| "userId"
	| "createdAt"
	| "updatedAt"
	| "materializedThrough"
	| "needsConfiguration"
	| "tags"
	| "debtSplit"
> & { debtSplit?: DebtSplitInput | null };
export interface RecurrenceOccurrence {
	id: string;
	recurrenceId: string;
	date: string;
	transactionId?: string;
	purchaseId?: string;
	deletedAt?: string;
}

export interface RecurrenceHistoryItem {
	id: string;
	recurrenceId: string;
	changedAt: string;
	field: string;
	oldValue: string | null;
	newValue: string | null;
}
export interface RecurrenceHistoryPage {
	items: RecurrenceHistoryItem[];
	hasMore: boolean;
	nextCursor: string | null;
}
