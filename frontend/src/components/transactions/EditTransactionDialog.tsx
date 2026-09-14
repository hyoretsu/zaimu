import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { DebtSplitInput, Transaction } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { formatLocalMonthYear } from "@/lib/date";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { getPayableCreditCardStatements } from "@/lib/payable-credit-card-statements";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { getUpdatedStoreName } from "@/lib/store-name";
import { showToast } from "@/stores";
import { TransactionDetailsFields } from "./TransactionDetailsFields";

function createDraft(transaction: Transaction) {
	return {
		amount: String(transaction.amount),
		creditCardStatementId: transaction.creditCardStatementId ?? "",
		date: transaction.date.slice(0, 10),
		destinationFinancialAccountId: transaction.destinationFinancialAccountId ?? "",
		isHidden: transaction.isHidden ?? false,
		originFinancialAccountId: transaction.originFinancialAccountId ?? "",
		storeName: transaction.storeName ?? "",
		tagIds: transaction.tagIds ?? transaction.tags?.map(tag => tag.id) ?? [],
		time: transaction.time ?? "",
		type: transaction.type,
	};
}

export function EditTransactionDialog({
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
	const [isDebt, setIsDebt] = useState(Boolean(transaction?.debtSplit));
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => debtSplitToInput(transaction?.debtSplit));
	const [description, setDescription] = useDebouncedInput(transaction?.description ?? "", () => undefined);
	const accountsQuery = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const payableStatementsQuery = useQuery({
		enabled: identity !== null && open && draft?.type === "EXPENSE",
		queryFn: () => getPayableCreditCardStatements(draft?.creditCardStatementId),
		queryKey: queryKeys.creditCardStatements.payable(identity!, draft?.creditCardStatementId),
	});

	useEffect(() => {
		if (!open || !transaction) return;
		setDraft(createDraft(transaction));
		setIsDebt(Boolean(transaction.debtSplit));
		setDebtSplit(debtSplitToInput(transaction.debtSplit));
		setDescription(transaction.description ?? "");
	}, [open, setDescription, transaction]);

	const update = useMutation({
		mutationFn: () => {
			if (!transaction || !draft) throw new Error("Transação não encontrada");
			const storeName = getUpdatedStoreName(
				transaction.storeName,
				draft.type === "EXPENSE" ? draft.storeName : null,
			);
			return dataService.transactions.update(transaction.id, {
				amount: Number.parseFloat(draft.amount),
				creditCardStatementId: draft.creditCardStatementId || null,
				date: draft.date,
				debtSplit: isDebt ? debtSplit : null,
				description: description.trim() || undefined,
				destinationFinancialAccountId: draft.destinationFinancialAccountId || null,
				isHidden: draft.isHidden,
				originFinancialAccountId: draft.originFinancialAccountId || null,
				...(storeName !== undefined && { storeName }),
				tagIds: draft.tagIds,
				time: draft.time || null,
				type: draft.type,
			});
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			showToast("Transação atualizada.", "positive");
			onOpenChange(false);
		},
	});

	if (!transaction || !draft) return null;
	const balanceDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const incomeDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const sourceAccounts = getTransactionSourceAccounts(accountsQuery.data ?? []).toSorted(
		compareFinancialAccountsByOptionLabel,
	);
	const primaryAccounts = draft.type === "INCOME" ? incomeDestinationAccounts : sourceAccounts;
	const primaryAccountId =
		draft.type === "INCOME" ? draft.destinationFinancialAccountId : draft.originFinancialAccountId;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar transação</DialogTitle>
					<DialogDescription>Altere os dados da movimentação.</DialogDescription>
				</DialogHeader>
				<div className="scrollbar-themed grid min-h-0 gap-4 overflow-y-auto pr-1">
					<TransactionDetailsFields
						amount={draft.amount}
						date={draft.date}
						description={description}
						isHidden={draft.isHidden}
						onAmountChange={amount => setDraft(current => (current ? { ...current, amount } : current))}
						onDateChange={date => setDraft(current => (current ? { ...current, date } : current))}
						onDescriptionChange={setDescription}
						onIsHiddenChange={isHidden => setDraft(current => (current ? { ...current, isHidden } : current))}
						onStoreNameChange={storeName =>
							setDraft(current => (current ? { ...current, storeName } : current))
						}
						onTagIdsChange={tagIds => setDraft(current => (current ? { ...current, tagIds } : current))}
						onTimeChange={time => setDraft(current => (current ? { ...current, time } : current))}
						onTypeChange={type => {
							if (type === "YIELD") return;
							if (type === "TRANSFER") setIsDebt(false);
							setDraft(current =>
								current
									? {
											...current,
											creditCardStatementId: type === "EXPENSE" ? current.creditCardStatementId : "",
											destinationFinancialAccountId:
												type === "INCOME" || type === "TRANSFER" ? current.destinationFinancialAccountId : "",
											originFinancialAccountId: type === "INCOME" ? "" : current.originFinancialAccountId,
											type,
										}
									: current,
							);
						}}
						showStore={draft.type === "EXPENSE"}
						storeName={draft.storeName}
						tagIds={draft.tagIds}
						time={draft.time}
						type={draft.type}
					/>
					{draft.type === "EXPENSE" ? (
						<CustomSelect
							disabled={payableStatementsQuery.isPending}
							label="Fatura para pagar"
							onValueChange={creditCardStatementId => {
								const selected = payableStatementsQuery.data?.find(
									item => item.statement.id === creditCardStatementId,
								);
								setDraft(current =>
									current
										? {
												...current,
												amount:
													current.amount || (selected ? selected.statement.balanceAmount.toFixed(2) : ""),
												creditCardStatementId,
											}
										: current,
								);
								setIsDebt(false);
							}}
							options={(payableStatementsQuery.data ?? []).map(({ card, statement }) => ({
								label: `${getCreditCardDisplayName(card)} · ${formatLocalMonthYear(statement.statementDate)} · ${new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(statement.balanceAmount)}`,
								value: statement.id,
							}))}
							placeholder="Nenhuma fatura selecionada"
							sortOptions={false}
							value={draft.creditCardStatementId}
						/>
					) : null}
					{draft.type !== "TRANSFER" ? (
						<div className="grid gap-3 rounded-2xl border p-3">
							<CheckboxField
								checkboxProps={{
									checked: isDebt,
									id: "edit-transaction-is-debt",
									onCheckedChange: checked => {
										setIsDebt(checked === true);
									},
								}}
							>
								<span>Esta movimentação é de uma dívida</span>
							</CheckboxField>
							{isDebt ? (
								<DebtSplitEditor amount={Number(draft.amount)} onChange={setDebtSplit} value={debtSplit} />
							) : null}
						</div>
					) : null}
					{primaryAccounts.length > 0 ? (
						<CustomSelect
							label={draft.type === "INCOME" ? "Conta de destino" : "Conta de origem"}
							onValueChange={accountId =>
								setDraft(current =>
									current
										? current.type === "INCOME"
											? { ...current, destinationFinancialAccountId: accountId }
											: { ...current, originFinancialAccountId: accountId }
										: current,
								)
							}
							options={primaryAccounts.map(account => ({
								label: getFinancialAccountOptionLabel(account),
								value: account.id,
							}))}
							placeholder="Selecione a conta"
							required
							value={primaryAccountId}
						/>
					) : null}
					{draft.type === "TRANSFER" && balanceDestinationAccounts.length > 0 ? (
						<CustomSelect
							label="Conta de destino"
							onValueChange={destinationFinancialAccountId =>
								setDraft(current => (current ? { ...current, destinationFinancialAccountId } : current))
							}
							options={balanceDestinationAccounts
								.filter(account => account.id !== draft.originFinancialAccountId)
								.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }))}
							placeholder="Selecione o destino"
							required
							value={draft.destinationFinancialAccountId}
						/>
					) : null}
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!draft.amount ||
							!primaryAccountId ||
							(isDebt && !calculateDebtSplit(Number(draft.amount), debtSplit)) ||
							(draft.type === "TRANSFER" && !draft.destinationFinancialAccountId) ||
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
