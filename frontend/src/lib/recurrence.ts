import type { RecurrenceDefinition } from "@zaimu/finance/recurrence";
import type { DebtSplit, DebtSplitInput, Tag } from "./api";
export interface Recurrence extends RecurrenceDefinition {
	legacySource?: "salary" | "subscription" | "recurring" | null;
	legacyId?: string | null;
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
	| "legacySource"
	| "legacyId"
> & { debtSplit?: DebtSplitInput | null };
export interface RecurrenceOccurrence {
	id: string;
	recurrenceId: string;
	date: string;
	transactionId?: string;
	purchaseId?: string;
	deletedAt?: string;
}
