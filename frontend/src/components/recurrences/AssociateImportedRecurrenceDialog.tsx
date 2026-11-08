import type { RecurrenceAssociationTarget } from "@zaimu/finance/recurrence";
import AssociateRecurrenceDialog from "./AssociateRecurrenceDialog";

export interface PendingImportRecurrence {
	date: string;
	name: string;
	recurrenceId: string;
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
