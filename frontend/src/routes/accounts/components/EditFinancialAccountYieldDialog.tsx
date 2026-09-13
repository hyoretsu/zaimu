import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
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
	useEffect(() => {
		if (entry) setAmount(String(entry.amount));
	}, [entry]);
	const refresh = () => invalidateCacheOperation(queryClient, identity!, "yield");
	const save = useMutation({
		mutationFn: async () => {
			if (!entry) throw new Error("Rendimento não encontrado");
			const value = Number.parseFloat(amount);
			if (entry.kind === "AUTOMATIC")
				return dataService.accountYields.upsertAutomatic({
					amount: value,
					date: entry.date,
					financialAccountId: entry.financialAccountId,
				});
			return dataService.accountYields.update(entry.id, value);
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await refresh();
			showToast("Rendimento atualizado.", "positive");
			onOpenChange(false);
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
					<DialogDescription>Altere somente o valor deste rendimento.</DialogDescription>
				</DialogHeader>
				<MoneyField
					id="financial-account-yield-amount"
					label="Valor"
					onValueChange={setAmount}
					required
					value={amount}
				/>
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
							disabled={!amount || save.isPending}
							onClick={() => save.mutate()}
						>
							{save.isPending ? "Salvando…" : "Salvar"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
