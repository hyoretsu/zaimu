import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { TimeField } from "@/components/ui/TimeField";
import { dataService } from "@/lib/dataService";
import type { FinancialAccountYieldEntry } from "@/lib/financial-account";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function EditFinancialAccountYieldDialog({
	entry,
	onOpenChange,
	open,
}: {
	entry: FinancialAccountYieldEntry | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
	const [date, setDate] = useState(entry?.date ?? "");
	const [time, setTime] = useState(entry?.time ?? "");
	const [isHidden, setIsHidden] = useState(entry?.isHidden ?? false);
	useEffect(() => {
		if (!entry) return;
		setAmount(String(entry.amount));
		setDate(entry.date);
		setTime(entry.time ?? "");
		setIsHidden(entry.isHidden ?? false);
	}, [entry]);
	const refresh = () => invalidateCacheOperation(queryClient, identity!, "yield");
	const save = useMutation({
		mutationFn: async (values: {
			amount: number;
			date: string;
			entry: FinancialAccountYieldEntry;
			isHidden: boolean;
			time: string | null;
		}) => {
			if (values.entry.kind === "AUTOMATIC")
				return dataService.accountYields.upsertAutomatic({
					amount: values.amount,
					date: values.entry.date,
					financialAccountId: values.entry.financialAccountId,
				});
			return dataService.accountYields.update(values.entry.id, {
				amount: values.amount,
				date: values.date,
				isHidden: values.isHidden,
				time: values.time,
			});
		},
		onError: (error, _, context) => {
			toast.dismiss(context?.toastId);
			showToast(error.message, "negative");
		},
		onMutate: () => {
			onOpenChange(false);
			return { toastId: toast.loading("Salvando rendimento…", { position: "bottom-right" }) };
		},
		onSuccess: async (_, __, context) => {
			await refresh();
			toast.success("Rendimento atualizado.", { id: context?.toastId, position: "bottom-right" });
		},
	});
	const remove = useMutation({
		mutationFn: async () => {
			if (!entry) throw new Error("Rendimento não encontrado");
			if (entry.kind === "AUTOMATIC")
				return dataService.accountYields.upsertAutomatic({
					date: entry.date,
					financialAccountId: entry.financialAccountId,
					isExcluded: true,
				});
			return dataService.accountYields.delete(entry.id);
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await refresh();
			showToast("Rendimento excluído.", "positive");
			onOpenChange(false);
		},
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Editar rendimento</DialogTitle>
					<DialogDescription>Atualize os dados do rendimento.</DialogDescription>
				</DialogHeader>
				<MoneyField
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
				<DialogFooter className="gap-2 sm:justify-between">
					<ConfirmActionButton
						aria-label="Excluir rendimento"
						className="cursor-pointer text-destructive hover:text-destructive"
						confirmation="Excluir rendimento?"
						disabled={remove.isPending}
						onConfirm={async () => {
							await remove.mutateAsync();
						}}
						variant="outline"
					>
						<LuTrash2 /> Excluir
					</ConfirmActionButton>
					<div className="flex gap-2">
						<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!amount || !date || save.isPending}
							onClick={() => {
								if (!entry) return;
								save.mutate({
									amount: Number.parseFloat(amount),
									date,
									entry,
									isHidden,
									time: time || null,
								});
							}}
						>
							{save.isPending ? "Salvando…" : "Salvar"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
