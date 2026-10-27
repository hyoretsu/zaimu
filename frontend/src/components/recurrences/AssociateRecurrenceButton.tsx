import type { RecurrenceAssociationTarget } from "@zaimu/finance/recurrence";
import { lazy, Suspense, useState } from "react";
import { LuLink } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";

const AssociateRecurrenceDialog = lazy(() => import("./AssociateRecurrenceDialog"));
export function AssociateRecurrenceButton({
	target,
	date,
	disabled,
}: {
	target: RecurrenceAssociationTarget;
	date: string;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	if (target.recurrenceId) return null;
	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						aria-label="Associar a recorrência"
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={disabled}
						onClick={() => setOpen(true)}
						size="icon-sm"
						type="button"
						variant="outline"
					>
						<LuLink />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Associar a recorrência</TooltipContent>
			</Tooltip>
			{open && (
				<Suspense fallback={null}>
					<AssociateRecurrenceDialog initialDate={date} onOpenChange={setOpen} target={target} />
				</Suspense>
			)}
		</>
	);
}
