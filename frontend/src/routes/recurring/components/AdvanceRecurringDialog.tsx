import { useState } from "react";
import { LuCalendarClock } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { TimeField } from "@/components/ui/TimeField";
import type { RecurringListItemData } from "./types";

export function AdvanceRecurringDialog({
	item,
	pending,
	onAdvance,
	onOpenChange,
}: {
	item: RecurringListItemData;
	pending: boolean;
	onAdvance: (time?: string) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const [time, setTime] = useState("");
	return (
		<Dialog onOpenChange={onOpenChange} open>
			<DialogContent showCloseButton={!pending}>
				<form
					className="space-y-4"
					onSubmit={event => {
						event.preventDefault();
						if (!pending) onAdvance(time || undefined);
					}}
				>
					<DialogHeader>
						<DialogTitle>Adiantar para hoje</DialogTitle>
						<DialogDescription>
							A próxima ocorrência de {item.title} será lançada hoje. A agenda permanece igual, sem repetir o
							lançamento na data original.
						</DialogDescription>
					</DialogHeader>
					<TimeField
						description="Deixe vazio para lançar sem horário."
						disabled={pending}
						id="advance-recurrence-time"
						label="Horário (opcional)"
						name="time"
						onValueChange={setTime}
						placeholder="14:30"
						value={time}
					/>
					{pending && (
						<p className="text-muted-foreground text-sm" role="status">
							Adiantando ocorrência...
						</p>
					)}
					<DialogFooter>
						<Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">
							Cancelar
						</Button>
						<Button disabled={pending} type="submit">
							<LuCalendarClock />
							Adiantar para hoje
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
