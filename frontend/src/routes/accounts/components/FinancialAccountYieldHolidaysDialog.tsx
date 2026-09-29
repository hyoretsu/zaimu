import { type SyntheticEvent, useState } from "react";
import { LuCalendarDays, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import type { FinancialAccountYieldHoliday } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

export function FinancialAccountYieldHolidaysDialog({
	holidays,
	onCreate,
	onDelete,
	pending,
	open: controlledOpen,
	onOpenChange,
}: {
	holidays: FinancialAccountYieldHoliday[];
	onCreate: (date: string) => Promise<unknown>;
	onDelete: (id: string) => Promise<unknown>;
	pending: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = (nextOpen: boolean) => {
		setInternalOpen(nextOpen);
		onOpenChange?.(nextOpen);
	};
	const [date, setDate] = useState("");
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!date) return;
		try {
			await onCreate(date);
			setDate("");
		} catch {
			return;
		}
	};
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button className="h-11 cursor-pointer" variant="outline">
					<LuCalendarDays /> Feriados
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Feriados de rendimento</DialogTitle>
					<DialogDescription>
						Em feriados, nenhuma conta recebe rendimento. Saldos são recalculados automaticamente.
					</DialogDescription>
				</DialogHeader>
				<form className="grid gap-4" onSubmit={submit}>
					<DateField
						autoComplete="off"
						id="financial-account-yield-holiday"
						label="Data do feriado"
						name="financial-account-yield-holiday"
						onValueChange={setDate}
						placeholder="Ex: 25/12/2026"
						required
						value={date}
					/>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={() => setOpen(false)} type="button" variant="outline">
							Fechar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={pending || !date}
							type="submit"
						>
							Marcar feriado
						</Button>
					</DialogFooter>
				</form>
				<div className="grid gap-2 border-t pt-4">
					{holidays.length ? (
						holidays.map(holiday => (
							<div
								className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
								key={holiday.id}
							>
								<span className="text-sm">{formatLocalDate(holiday.date)}</span>
								<ConfirmActionButton
									aria-label={`Remover feriado ${formatLocalDate(holiday.date)}`}
									confirmation="Remover este feriado?"
									onConfirm={async () => {
										await onDelete(holiday.id);
									}}
									size="icon-sm"
									variant="destructive"
								>
									<LuTrash2 />
								</ConfirmActionButton>
							</div>
						))
					) : (
						<p className="text-muted-foreground text-sm">Nenhum feriado marcado.</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
