import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { TransactionDetailsFields } from "./TransactionDetailsFields";

function createDraft(transaction: Transaction) {
	return {
		amount: String(transaction.amount),
		date: transaction.date.slice(0, 10),
		originFinancialAccountId: transaction.originFinancialAccountId ?? "",
		time: transaction.time ?? "",
	};
}

export function EditStatementPaymentDialog({
	onOpenChange,
	open,
	transaction,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	transaction: Transaction | null;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [draft, setDraft] = useState(() => (transaction ? createDraft(transaction) : null));
	const [sendWithoutTime, setSendWithoutTime] = useState(!transaction?.time);
	const accountsQuery = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});

	useEffect(() => {
		if (!open || !transaction) return;
		setDraft(createDraft(transaction));
		setSendWithoutTime(!transaction.time);
	}, [open, transaction]);

	const update = useMutation({
		mutationFn: () => {
			if (!transaction || !draft) throw new Error("Pagamento não encontrado");
			return dataService.transactions.update(transaction.id, {
				amount: Number.parseFloat(draft.amount),
				date: draft.date,
				originFinancialAccountId: draft.originFinancialAccountId,
				time: sendWithoutTime ? null : draft.time || null,
			});
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "statement");
			showToast("Pagamento da fatura atualizado.", "positive");
			onOpenChange(false);
		},
	});

	if (!transaction || !draft) return null;
	const balanceAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar pagamento da fatura</DialogTitle>
					<DialogDescription>O saldo e a situação da fatura são recalculados ao salvar.</DialogDescription>
				</DialogHeader>
				<div className="scrollbar-themed grid min-h-0 gap-4 overflow-y-auto pr-1">
					{accountsQuery.isPending ? (
						<div className="grid gap-4">
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
						</div>
					) : accountsQuery.isError ? (
						<p className="rounded-xl border border-destructive/30 p-3 text-destructive text-sm">
							Não foi possível carregar as contas pagadoras.
						</p>
					) : (
						<>
							<TransactionDetailsFields
								amount={draft.amount}
								date={draft.date}
								description=""
								onAmountChange={amount => setDraft(current => (current ? { ...current, amount } : current))}
								onDateChange={date => setDraft(current => (current ? { ...current, date } : current))}
								onDescriptionChange={() => undefined}
								onSendWithoutTimeChange={setSendWithoutTime}
								onStoreNameChange={() => undefined}
								onTagIdsChange={() => undefined}
								onTimeChange={time => setDraft(current => (current ? { ...current, time } : current))}
								onTypeChange={() => undefined}
								sendWithoutTime={sendWithoutTime}
								showDescription={false}
								showStore={false}
								showTags={false}
								showType={false}
								storeName=""
								tagIds={[]}
								time={draft.time}
								type="EXPENSE"
							/>
							{balanceAccounts.length ? (
								<CustomSelect
									label="Conta pagadora"
									onValueChange={originFinancialAccountId =>
										setDraft(current => (current ? { ...current, originFinancialAccountId } : current))
									}
									options={balanceAccounts.map(account => ({
										label: getFinancialAccountOptionLabel(account),
										value: account.id,
									}))}
									placeholder="Selecione a conta"
									required
									value={draft.originFinancialAccountId}
								/>
							) : (
								<p className="rounded-xl border p-3 text-muted-foreground text-sm">
									Nenhuma conta com saldo próprio disponível.
								</p>
							)}
						</>
					)}
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							accountsQuery.isPending ||
							accountsQuery.isError ||
							!draft.amount ||
							!draft.originFinancialAccountId ||
							update.isPending
						}
						onClick={() => update.mutate()}
					>
						{update.isPending ? "Salvando…" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
