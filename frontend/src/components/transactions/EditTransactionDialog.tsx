import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import type { DebtSplitInput, FinancialAccount, Transaction } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { getUpdatedStoreName } from "@/lib/store-name";
import { showToast } from "@/stores";
import { TransactionDetailsFields } from "./TransactionDetailsFields";

function createDraft(transaction: Transaction) {
	return {
		amount: String(transaction.amount),
		date: transaction.date.slice(0, 10),
		destinationFinancialAccountId: transaction.destinationFinancialAccountId ?? "",
		isHidden: transaction.isHidden ?? false,
		originFinancialAccountId: transaction.originFinancialAccountId ?? "",
		paymentCreditCardId: transaction.paymentCreditCardId ?? "",
		storeName: transaction.storeName ?? "",
		tagIds: transaction.tagIds ?? transaction.tags?.map(tag => tag.id) ?? [],
		time: transaction.time ?? "",
		type: transaction.type,
	};
}

export function EditTransactionDialog({
	account,
	onOpenChange,
	open,
	transaction,
}: {
	account?: FinancialAccount;
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
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});

	useEffect(() => {
		if (!open || !transaction) return;
		setDraft(createDraft(transaction));
		setIsDebt(Boolean(transaction.debtSplit));
		setDebtSplit(debtSplitToInput(transaction.debtSplit));
		setDescription(transaction.description ?? "");
	}, [open, setDescription, transaction]);

	const update = useMutation({
		mutationFn: ({
			transaction,
			draft,
			isDebt,
			debtSplit,
			description,
		}: {
			transaction: Transaction;
			draft: ReturnType<typeof createDraft>;
			isDebt: boolean;
			debtSplit: DebtSplitInput;
			description: string;
		}) => {
			const storeName = getUpdatedStoreName(
				transaction.storeName,
				draft.type === "EXPENSE" ? draft.storeName : null,
			);
			return dataService.transactions.update(transaction.id, {
				amount: Number.parseFloat(draft.amount),
				date: draft.date,
				debtSplit: isDebt ? debtSplit : null,
				description: description.trim() || undefined,
				destinationFinancialAccountId: draft.destinationFinancialAccountId || null,
				isHidden: draft.isHidden,
				originFinancialAccountId: draft.originFinancialAccountId || null,
				paymentCreditCardId: draft.paymentCreditCardId || null,
				...(storeName !== undefined && { storeName }),
				tagIds: draft.tagIds,
				time: draft.time || null,
				type: draft.type,
			});
		},
		onError: (error, _, context) => {
			toast.dismiss(context?.toastId);
			showToast(error.message, "negative");
		},
		onMutate: () => {
			onOpenChange(false);
			return { toastId: toast.loading("Salvando transação…", { position: "bottom-right" }) };
		},
		onSuccess: async (_, __, context) => {
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			toast.success("Transação atualizada.", { id: context?.toastId, position: "bottom-right" });
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
	const primaryAccountOptions = primaryAccounts.map(account => ({
		label: getFinancialAccountOptionLabel(account),
		value: account.id,
	}));
	if (primaryAccountId && !primaryAccountOptions.some(option => option.value === primaryAccountId)) {
		primaryAccountOptions.unshift({
			label:
				(draft.type === "INCOME" ? transaction.destinationName : transaction.originName) || "Conta atual",
			value: primaryAccountId,
		});
	}
	const paymentCardOptions = (payableStatementsQuery.data ?? []).map(card => ({
		label: getCreditCardDisplayName(card),
		value: card.id,
	}));
	if (
		draft.paymentCreditCardId &&
		!paymentCardOptions.some(option => option.value === draft.paymentCreditCardId)
	) {
		paymentCardOptions.unshift({
			label: transaction.creditCardName || "Cartão atual",
			value: draft.paymentCreditCardId,
		});
	}

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
											destinationFinancialAccountId:
												type === "INCOME" || type === "TRANSFER"
													? type === "INCOME" && current.type === "EXPENSE"
														? current.originFinancialAccountId
														: current.destinationFinancialAccountId
													: "",
											originFinancialAccountId: type === "INCOME" ? "" : current.originFinancialAccountId,
											paymentCreditCardId: type === "EXPENSE" ? current.paymentCreditCardId : "",
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
							label="Cartão para pagar"
							onValueChange={paymentCreditCardId => {
								setDraft(current =>
									current
										? {
												...current,
												paymentCreditCardId,
											}
										: current,
								);
								setIsDebt(false);
							}}
							options={paymentCardOptions}
							placeholder="Nenhum cartão selecionado"
							searchable
							sortOptions={false}
							value={draft.paymentCreditCardId}
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
								<DebtSplitEditor
									amount={Number(draft.amount)}
									onChange={setDebtSplit}
									showParticipantDescriptions={draft.type === "EXPENSE"}
									value={debtSplit}
								/>
							) : null}
						</div>
					) : null}
					{accountsQuery.isPending || primaryAccountOptions.length > 0 ? (
						<CustomSelect
							disabled={accountsQuery.isPending || accountsQuery.isError}
							label={draft.type === "INCOME" ? "Conta de destino" : "Conta de origem"}
							onValueChange={accountId =>
								setDraft(current =>
									current
										? current.type === "INCOME"
											? { ...current, destinationFinancialAccountId: accountId }
											: {
													...current,
													destinationFinancialAccountId:
														current.type === "TRANSFER"
															? account && accountId !== account.id
																? account.id
																: current.destinationFinancialAccountId === accountId
																	? ""
																	: current.destinationFinancialAccountId
															: current.destinationFinancialAccountId,
													originFinancialAccountId: accountId,
												}
										: current,
								)
							}
							options={primaryAccountOptions}
							placeholder="Selecione a conta"
							required
							searchable
							value={primaryAccountId}
						/>
					) : null}
					{draft.type === "TRANSFER" &&
					(accountsQuery.isPending ||
						balanceDestinationAccounts.length > 0 ||
						draft.destinationFinancialAccountId) ? (
						<CustomSelect
							disabled={accountsQuery.isPending || accountsQuery.isError}
							label="Conta de destino"
							onValueChange={destinationFinancialAccountId =>
								setDraft(current =>
									current
										? {
												...current,
												destinationFinancialAccountId,
												originFinancialAccountId:
													account && destinationFinancialAccountId !== account.id
														? account.id
														: current.originFinancialAccountId,
											}
										: current,
								)
							}
							options={[
								...balanceDestinationAccounts
									.filter(account => account.id !== draft.originFinancialAccountId)
									.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id })),
								...(draft.destinationFinancialAccountId &&
								!balanceDestinationAccounts.some(
									account => account.id === draft.destinationFinancialAccountId,
								)
									? [
											{
												label: transaction.destinationName || "Conta atual",
												value: draft.destinationFinancialAccountId,
											},
										]
									: []),
							]}
							placeholder="Selecione o destino"
							required
							searchable
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
						onClick={() => update.mutate({ debtSplit, description, draft, isDebt, transaction })}
					>
						{update.isPending ? "Salvando…" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
