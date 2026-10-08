import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { ScrollArea } from "@/components/ui/ScrollArea";
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
		currency: transaction.bookingCurrency ?? "BRL",
		date: transaction.date.slice(0, 10),
		originFinancialAccountId: transaction.originFinancialAccountId ?? "",
		paymentAmount: String(transaction.paymentAmount ?? transaction.amount),
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
	const accountsQuery = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});

	useEffect(() => {
		if (!open || !transaction) return;
		setDraft(createDraft(transaction));
	}, [open, transaction]);

	const update = useMutation({
		mutationFn: () => {
			if (!transaction || !draft) throw new Error("Pagamento não encontrado");
			return dataService.transactions.update(transaction.id, {
				amount: Number.parseFloat(draft.amount),
				currency: draft.currency,
				date: draft.date,
				originFinancialAccountId: draft.originFinancialAccountId,
				paymentAmount: draft.paymentAmount ? Number(draft.paymentAmount) : undefined,
				time: draft.time || null,
			});
		},
		onError: (error, _, context) => {
			toast.dismiss(context?.toastId);
			showToast(error.message, "negative");
		},
		onMutate: () => {
			onOpenChange(false);
			return { toastId: toast.loading("Salvando pagamento…", { position: "bottom-right" }) };
		},
		onSuccess: async (_, __, context) => {
			await invalidateCacheOperation(queryClient, identity!, "statement");
			toast.success("Pagamento da fatura atualizado.", { id: context?.toastId, position: "bottom-right" });
		},
	});

	if (!transaction || !draft) return null;
	const balanceAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const accountOptions = balanceAccounts.map(account => ({
		label: getFinancialAccountOptionLabel(account),
		value: account.id,
	}));
	if (
		draft.originFinancialAccountId &&
		!accountOptions.some(option => option.value === draft.originFinancialAccountId)
	) {
		accountOptions.unshift({
			label: transaction.originName || "Conta atual",
			value: draft.originFinancialAccountId,
		});
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar pagamento da fatura</DialogTitle>
					<DialogDescription>O saldo e a situação da fatura são recalculados ao salvar.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0">
					<div className="grid gap-4 pr-1">
						<TransactionDetailsFields
							amount={draft.amount}
							bookingCurrency={
								accountsQuery.data?.find(account => account.id === draft.originFinancialAccountId)
									?.currency ?? draft.currency
							}
							currencyCode={draft.currency}
							date={draft.date}
							description=""
							onAmountChange={amount => setDraft(current => (current ? { ...current, amount } : current))}
							onCurrencyChange={currency =>
								setDraft(current => (current ? { ...current, currency } : current))
							}
							onDateChange={date => setDraft(current => (current ? { ...current, date } : current))}
							onDescriptionChange={() => undefined}
							onPaymentAmountChange={paymentAmount =>
								setDraft(current => (current ? { ...current, paymentAmount } : current))
							}
							onStoreNameChange={() => undefined}
							onTagIdsChange={() => undefined}
							onTimeChange={time => setDraft(current => (current ? { ...current, time } : current))}
							onTypeChange={() => undefined}
							paymentAmount={draft.paymentAmount}
							paymentCurrency={transaction.paymentCurrency ?? transaction.bookingCurrency ?? "BRL"}
							showDescription={false}
							showStore={false}
							showTags={false}
							showType={false}
							storeName=""
							tagIds={[]}
							time={draft.time}
							type="EXPENSE"
						/>
						{accountsQuery.isPending ? (
							<Skeleton className="h-20" />
						) : accountsQuery.isError ? (
							<p className="text-destructive text-sm">Contas pagadoras indisponíveis.</p>
						) : accountOptions.length ? (
							<CustomSelect
								disabled={accountsQuery.isPending || accountsQuery.isError}
								label="Conta pagadora"
								onValueChange={originFinancialAccountId =>
									setDraft(current => (current ? { ...current, originFinancialAccountId } : current))
								}
								options={accountOptions}
								placeholder="Selecione a conta"
								required
								searchable
								value={draft.originFinancialAccountId}
							/>
						) : (
							<p className="rounded-xl border p-3 text-muted-foreground text-sm">
								Nenhuma conta com saldo próprio disponível.
							</p>
						)}
					</div>
				</ScrollArea>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!draft.amount || !draft.originFinancialAccountId || update.isPending}
						onClick={() => update.mutate()}
					>
						{update.isPending ? "Salvando…" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
