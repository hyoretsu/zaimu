import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
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
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function BalanceAdjustmentForm({
	adjustment,
	existingAdjustments,
	onClose,
}: {
	adjustment: BalanceAdjustment | null;
	existingAdjustments: BalanceAdjustment[];
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [balance, setBalance] = useState(adjustment ? String(adjustment.balance) : "");
	const [date, setDate] = useState(adjustment?.date.slice(0, 10) ?? getLocalDateKey());
	const [financialAccountId, setFinancialAccountId] = useState(adjustment?.financialAccountId ?? "");
	// Keep the available accounts stable while the form is open, even if adjustments refetch.
	const [adjustedAccountIds] = useState(
		() => new Set(existingAdjustments.map(existing => existing.financialAccountId)),
	);
	const accountsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const accounts = (accountsQuery.data ?? [])
		.filter(
			account =>
				account.type !== "CREDIT_CARD" &&
				account.type !== "REWARDS" &&
				(adjustment !== null || !adjustedAccountIds.has(account.id)),
		)
		.toSorted(compareFinancialAccountsByOptionLabel);
	const save = useMutation({
		mutationFn: () => {
			const data = { balance: Number(balance), date, financialAccountId };
			return adjustment
				? dataService.balanceAdjustments.update(adjustment.id, data)
				: dataService.balanceAdjustments.create(data);
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await Promise.all([
				invalidateCacheOperation(queryClient, identity!, "transaction"),
				queryClient.invalidateQueries({ queryKey: ["identity", identity, "balance-adjustments"] }),
			]);
			showToast("Ajuste de saldo salvo.", "positive");
			onClose();
		},
	});
	return (
		<Dialog onOpenChange={open => !open && onClose()} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{adjustment ? "Editar ajuste de saldo" : "Novo ajuste de saldo"}</DialogTitle>
					<DialogDescription>
						Informe o saldo real da conta ao fim deste dia. Movimentações anteriores recalculam a diferença
						automaticamente.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<CustomSelect
						label="Conta"
						onValueChange={setFinancialAccountId}
						options={accounts.map(account => ({
							label: getFinancialAccountOptionLabel(account),
							value: account.id,
						}))}
						placeholder="Selecione a conta"
						required
						searchable
						value={financialAccountId}
					/>
					<DateField
						id="balance-adjustment-date"
						label="Data"
						name="date"
						onValueChange={setDate}
						required
						value={date}
					/>
					<MoneyField
						id="balance-adjustment-balance"
						label="Saldo real"
						onValueChange={setBalance}
						required
						value={balance}
					/>
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={onClose} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!balance || !date || !financialAccountId || save.isPending}
						onClick={() => save.mutate()}
					>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
