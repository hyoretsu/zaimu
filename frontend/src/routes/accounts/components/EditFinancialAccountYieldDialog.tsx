import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { TimeField } from "@/components/ui/TimeField";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import type { FinancialAccountYieldEntry } from "@/lib/financial-account";
import { useCacheIdentity } from "@/lib/query-cache";

export function EditFinancialAccountYieldDialog({
	entry: suppliedEntry,
	onOpenChange,
	open,
}: {
	entry: FinancialAccountYieldEntry | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [recovered, setRecovered] = useState<{
		entry: FinancialAccountYieldEntry;
		amount: string;
		date: string;
		time: string;
		isHidden: boolean;
	} | null>(null);
	const entry = recovered?.entry ?? suppliedEntry;
	useBackgroundModalRecovery<NonNullable<typeof recovered>>("yield-edit", recovery => {
		setRecovered(recovery.payload);
		setAmount(recovery.payload.amount);
		setDate(recovery.payload.date);
		setTime(recovery.payload.time);
		setIsHidden(recovery.payload.isHidden);
	});
	const changeOpen = (next: boolean) => {
		if (!next) setRecovered(null);
		onOpenChange(next);
	};
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
	const [date, setDate] = useState(entry?.date ?? "");
	const [time, setTime] = useState(entry?.time ?? "");
	const [isHidden, setIsHidden] = useState(entry?.isHidden ?? false);
	useEffect(() => {
		if (!entry || recovered) return;
		setAmount(String(entry.amount));
		setDate(entry.date);
		setTime(entry.time ?? "");
		setIsHidden(entry.isHidden ?? false);
	}, [entry, recovered]);
	const pending = useModalRecoveryStore(state => !!state.pending[`${identity}:yield:${entry?.id}`]);
	const submit = (deleting: boolean) => {
		if (!entry) return;
		const draft = { amount, date, entry, isHidden, time };
		runBackgroundModalAction<unknown>({
			cache: { client: queryClient, operations: ["yield"] },
			close: () => changeOpen(false),
			conflictKey: `yield:${entry.id}`,
			failureMessage: "Não foi possível atualizar rendimento.",
			loadingMessage: deleting ? "Excluindo rendimento..." : "Salvando rendimento...",
			recovery: { entityId: entry.id, kind: "yield-edit", payload: draft },
			run: () =>
				deleting
					? draft.entry.kind === "AUTOMATIC"
						? dataService.accountYields.upsertAutomatic({
								date: draft.entry.date,
								financialAccountId: draft.entry.financialAccountId,
								isExcluded: true,
							})
						: dataService.accountYields.delete(draft.entry.id)
					: draft.entry.kind === "AUTOMATIC"
						? dataService.accountYields.upsertAutomatic({
								amount: Number(draft.amount),
								date: draft.entry.date,
								financialAccountId: draft.entry.financialAccountId,
							})
						: dataService.accountYields.update(draft.entry.id, {
								amount: Number(draft.amount),
								date: draft.date,
								isHidden: draft.isHidden,
								time: draft.time || null,
							}),
			successMessage: deleting ? "Rendimento excluído." : "Rendimento atualizado.",
		});
	};

	return (
		<Dialog onOpenChange={changeOpen} open={open || recovered !== null}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Editar rendimento</DialogTitle>
					<DialogDescription>Atualize os dados do rendimento.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<MoneyField
						currencyCode={entry?.currency ?? "BRL"}
						id="financial-account-yield-amount"
						label="Valor"
						onValueChange={setAmount}
						required
						value={amount}
					/>
					{entry?.kind === "MANUAL" ? (
						<>
							<DateField
								id="financial-account-yield-date"
								label="Data"
								name="date"
								onValueChange={setDate}
								required
								value={date}
							/>
							<TimeField
								id="financial-account-yield-time"
								label="Horário"
								name="time"
								onValueChange={setTime}
								value={time}
							/>
							<CheckboxField
								checkboxProps={{
									checked: isHidden,
									id: "financial-account-yield-hidden",
									onCheckedChange: checked => setIsHidden(checked === true),
								}}
							>
								<span>Ocultar na lista do dia</span>
							</CheckboxField>
						</>
					) : null}
				</DialogBody>
				<DialogFooter>
					<ConfirmActionButton
						aria-label="Excluir rendimento"
						className="cursor-pointer text-destructive hover:text-destructive"
						confirmation="Excluir rendimento?"
						disabled={pending}
						onConfirm={() => submit(true)}
						variant="outline"
					>
						<LuTrash2 /> Excluir
					</ConfirmActionButton>
					<ActionGroup>
						<Button className="cursor-pointer" onClick={() => changeOpen(false)} variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!amount || !date || pending}
							onClick={() => submit(false)}
						>
							{pending ? "Salvando…" : "Salvar"}
						</Button>
					</ActionGroup>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
