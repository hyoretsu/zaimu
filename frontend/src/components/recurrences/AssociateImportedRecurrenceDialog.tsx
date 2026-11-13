import type { RecurrenceAssociationTarget } from "@zaimu/finance/recurrence";
import type { Transaction } from "@/lib/api";
import AssociateRecurrenceDialog from "./AssociateRecurrenceDialog";

export interface PendingImportRecurrence {
	date: string;
	name: string;
	recurrenceId: string;
	/** What approving the item will copy from the recurrence, so the row can preview it. */
	preview: Pick<Transaction, "debtSplit" | "storeName" | "tagIds" | "tags">;
}

/** Row data as it will look after approval: name, store, tags and debt split come from the recurrence. */
export function withRecurrencePreview(
	transaction: Transaction,
	recurrence?: PendingImportRecurrence,
): Transaction {
	return recurrence ? { ...transaction, ...recurrence.preview, description: recurrence.name } : transaction;
}

/** Records the chosen recurrence on the pending item; the link is only saved when the item is approved. */
export function AssociateImportedRecurrenceDialog({
	target,
	date,
	onOpenChange,
	onSelect,
}: {
	target: RecurrenceAssociationTarget;
	date: string;
	onOpenChange: (open: boolean) => void;
	onSelect: (recurrence: PendingImportRecurrence) => void;
}) {
	return (
		<AssociateRecurrenceDialog
			initialDate={date}
			onAssociate={onSelect}
			onOpenChange={onOpenChange}
			target={target}
		/>
	);
}
