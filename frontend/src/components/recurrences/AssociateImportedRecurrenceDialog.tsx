import type { RecurrenceAssociationTarget } from "@zaimu/finance/recurrence";
import { dataService } from "@/lib/dataService";
import AssociateRecurrenceDialog from "./AssociateRecurrenceDialog";

export function AssociateImportedRecurrenceDialog({
	importId,
	target,
	date,
	onOpenChange,
	onAssociated,
}: {
	importId: string;
	target: RecurrenceAssociationTarget;
	date: string;
	onOpenChange: (open: boolean) => void;
	onAssociated?: () => Promise<unknown>;
}) {
	return (
		<AssociateRecurrenceDialog
			initialDate={date}
			onAssociate={async (recurrenceId, date) => {
				const recurrence = { date, recurrenceId };
				if (target.kind === "PURCHASE")
					return dataService.creditCardImports.approveItem(importId, target.id, { recurrence });
				return dataService.transactionImports.approveItem(importId, target.id, { recurrence });
			}}
			onAssociated={onAssociated}
			onOpenChange={onOpenChange}
			target={target}
		/>
	);
}
