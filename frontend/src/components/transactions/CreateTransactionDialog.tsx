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
import { formatLocalMonthYear, getCurrentLocalTime, getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { getPayableCreditCardStatements } from "@/lib/payable-credit-card-statements";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { TransactionDetailsFields } from "./TransactionDetailsFields";

const initialDraft = () => ({
	amount: "",
	creditCardStatementId: "",
	date: getLocalDateKey(),
	destinationFinancialAccountId: "",
	isHidden: false,
	originFinancialAccountId: "",
	storeName: "",
	tagIds: [] as string[],
	time: getCurrentLocalTime(),
	type: "EXPENSE" as Transaction["type"] | "YIELD",
});

interface CreateTransactionInput {
	debtSplit: DebtSplitInput;
	description: string;
	draft: ReturnType<typeof initialDraft>;
	isDebt: boolean;
	sendWithoutTime: boolean;
}

export function CreateTransactionDialog({
	onOpenChange,
	open,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [draft, setDraft] = useState(initialDraft);
	const [isDebt, setIsDebt] = useState(false);
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>({
		mode: "SHARES",
		ownerShares: null,
		participants: [{ debtPersonId: "", shares: 1 }],
	});
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	const [sendWithoutTime, setSendWithoutTime] = useState(false);
	useEffect(() => {
		if (!open) return;
		setDraft(current => ({ ...current, time: getCurrentLocalTime() }));
		setSendWithoutTime(false);
	}, [open]);
	const accountsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const payableStatementsQuery = useQuery({
		enabled: identity !== null && open && draft.type === "EXPENSE",
		queryFn: () => getPayableCreditCardStatements(),
		queryKey: queryKeys.creditCardStatements.payable(identity!),
	});
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
	const primaryAccounts =
		draft.type === "INCOME"
			? incomeDestinationAccounts
			: draft.type === "YIELD"
				? balanceDestinationAccounts
				: sourceAccounts;
	const selectedStatement = payableStatementsQuery.data?.find(
		item => item.statement.id === draft.creditCardStatementId,
	);
	const primaryAccountId =
		draft.type === "INCOME" || draft.type === "YIELD"
			? draft.destinationFinancialAccountId
			: draft.originFinancialAccountId;
	const reset = () => {
		setDraft(initialDraft());
		setDescription("");
		setIsDebt(false);
		setDebtSplit({ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "", shares: 1 }] });
		setSendWithoutTime(false);
	};
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
		if (!nextOpen) reset();
	};
	const create = useMutation({
		mutationFn: async ({
			debtSplit,
			description,
			draft,
			isDebt,
			sendWithoutTime,
		}: CreateTransactionInput) => {
			const amount = Number.parseFloat(draft.amount);
			if (draft.type === "YIELD") {
				return dataService.accountYields.create({
					amount,
					date: draft.date,
					financialAccountId: draft.destinationFinancialAccountId,
				});
			}
			const transaction = await dataService.transactions.create({
				amount,
				creditCardStatementId: draft.creditCardStatementId || undefined,
				date: draft.date,
				debtSplit: isDebt ? debtSplit : undefined,
				description: description.trim() || undefined,
				destinationFinancialAccountId: draft.destinationFinancialAccountId || undefined,
				isHidden: draft.isHidden,
				originFinancialAccountId: draft.originFinancialAccountId || undefined,
				storeName: draft.type === "EXPENSE" ? draft.storeName.trim() || undefined : undefined,
				tagIds: draft.tagIds,
				time: sendWithoutTime ? null : draft.time || undefined,
				type: draft.type,
			});
			return { statement: null, transaction };
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async (_, { draft }) => {
			await invalidateCacheOperation(
				queryClient,
				identity!,
				draft.type === "YIELD" ? "yield" : "transaction",
			);
			showToast(
				draft.creditCardStatementId
					? "Transação associada à fatura."
					: draft.type === "YIELD"
						? "Rendimento registrado."
						: "Transação registrada.",
				"positive",
			);
		},
	});
	const save = () => {
		create.mutate({ debtSplit, description, draft, isDebt, sendWithoutTime });
		reset();
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Nova transação</DialogTitle>
					<DialogDescription>Informe os dados da movimentação.</DialogDescription>
				</DialogHeader>
				<div className="scrollbar-themed grid min-h-0 gap-4 overflow-y-auto pr-1">
					<TransactionDetailsFields
						amount={draft.amount}
						date={draft.date}
						description={description}
						includeYield
						isHidden={draft.isHidden}
						onAmountChange={amount => setDraft(current => ({ ...current, amount }))}
						onDateChange={date => setDraft(current => ({ ...current, date }))}
						onDescriptionChange={setDescription}
						onIsHiddenChange={isHidden => setDraft(current => ({ ...current, isHidden }))}
						onSendWithoutTimeChange={setSendWithoutTime}
						onStoreNameChange={storeName => setDraft(current => ({ ...current, storeName }))}
						onTagIdsChange={tagIds => setDraft(current => ({ ...current, tagIds }))}
						onTimeChange={time => setDraft(current => ({ ...current, time }))}
						onTypeChange={type => {
							if (type === "TRANSFER") setIsDebt(false);
							setDraft(current => ({
								...current,
								creditCardStatementId: type === "EXPENSE" ? current.creditCardStatementId : "",
								destinationFinancialAccountId:
									type === "INCOME" || type === "YIELD" || type === "TRANSFER"
										? type === "INCOME" && current.type === "EXPENSE"
											? current.originFinancialAccountId
											: current.destinationFinancialAccountId
										: "",
								originFinancialAccountId:
									type === "INCOME" || type === "YIELD" ? "" : current.originFinancialAccountId,
								type,
							}));
						}}
						sendWithoutTime={sendWithoutTime}
						showDescription={draft.type !== "YIELD"}
						showStore={draft.type === "EXPENSE"}
						showTags={draft.type !== "TRANSFER" && draft.type !== "YIELD"}
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
								const selectedPayableStatement = payableStatementsQuery.data?.find(
									item => item.statement.id === creditCardStatementId,
								);
								const remainingAmount = selectedPayableStatement?.statement.balanceAmount ?? null;
								setDraft(current => ({
									...current,
									amount: current.amount || (remainingAmount === null ? "" : remainingAmount.toFixed(2)),
									creditCardStatementId,
								}));
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
					{draft.type !== "TRANSFER" && draft.type !== "YIELD" && !selectedStatement ? (
						<div className="grid gap-3 rounded-2xl border p-3">
							<CheckboxField
								checkboxProps={{
									checked: isDebt,
									id: "transaction-is-debt",
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
					{primaryAccounts.length > 0 && (
						<CustomSelect
							label={
								draft.type === "INCOME" || draft.type === "YIELD"
									? "Conta de destino"
									: draft.type === "TRANSFER"
										? "Conta de origem"
										: "Conta"
							}
							onValueChange={accountId =>
								setDraft(current =>
									current.type === "INCOME" || current.type === "YIELD"
										? { ...current, destinationFinancialAccountId: accountId, originFinancialAccountId: "" }
										: {
												...current,
												destinationFinancialAccountId:
													current.type === "TRANSFER" ? current.destinationFinancialAccountId : "",
												originFinancialAccountId: accountId,
											},
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
					)}
					{draft.type === "TRANSFER" && balanceDestinationAccounts.length > 0 && (
						<CustomSelect
							label="Conta de destino"
							onValueChange={destinationFinancialAccountId =>
								setDraft(current => ({ ...current, destinationFinancialAccountId }))
							}
							options={balanceDestinationAccounts
								.filter(account => account.id !== draft.originFinancialAccountId)
								.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }))}
							placeholder="Selecione o destino"
							required
							value={draft.destinationFinancialAccountId}
						/>
					)}
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => handleOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!draft.amount ||
							!primaryAccountId ||
							(isDebt && !calculateDebtSplit(Number(draft.amount), debtSplit)) ||
							(draft.type === "TRANSFER" && !draft.destinationFinancialAccountId)
						}
						onClick={save}
					>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
