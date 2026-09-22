import type { TransactionImportDuplicate, TransactionImportItem } from "@/lib/api";

export type DuplicateField =
	| "amount"
	| "date"
	| "debtSplit"
	| "description"
	| "destinationFinancialAccountId"
	| "isHidden"
	| "originFinancialAccountId"
	| "storeName"
	| "tagIds"
	| "time"
	| "type";

export type DuplicateSource = "duplicate" | "imported";
export type DuplicateResolutionSources = Partial<Record<DuplicateField, DuplicateSource>>;

export interface DuplicateFieldOption {
	key: DuplicateField;
	label: string;
}

export type DuplicateCandidate = TransactionImportDuplicate;
export type ImportedTransaction = TransactionImportItem;
