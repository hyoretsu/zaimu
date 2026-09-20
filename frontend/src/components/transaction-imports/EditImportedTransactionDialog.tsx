import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { TransactionDetailsFields } from "@/components/transactions/TransactionDetailsFields";
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
import type { DebtSplitInput, FinancialAccount, TransactionImportItem } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { formatLocalMonthYear } from "@/lib/date";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { getPayableCreditCardStatements } from "@/lib/payable-credit-card-statements";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

type EditableItem = Omit<
	Pick<
		TransactionImportItem,
		| "amount"
		| "creditCardStatementId"
		| "date"
		| "debtSplit"
		| "description"
		| "destinationFinancialAccountId"
		| "isHidden"
		| "originFinancialAccountId"
		| "storeName"
		| "tagIds"
		| "time"
		| "type"
	>,
	"debtSplit"
> & { debtSplit: DebtSplitInput | null };

const toDraft = (item: TransactionImportItem): EditableItem => ({
	amount: item.amount,
	creditCardStatementId: item.creditCardStatementId ?? null,
	date: item.date.slice(0, 10),
	debtSplit: debtSplitToInput(item.debtSplit),
	description: item.description ?? "",
	destinationFinancialAccountId: item.destinationFinancialAccountId ?? null,
	isHidden: item.isHidden,
	originFinancialAccountId: item.originFinancialAccountId ?? null,
	storeName: item.storeName ?? "",
	tagIds: item.tagIds,
	time: item.time ?? "",
	type: item.type,
});

export function EditImportedTransactionDialog({
	accounts,
	item,
	onOpenChange,
	onSubmit,
	open,
	pending,
}: {
	accounts: FinancialAccount[];
	item: TransactionImportItem | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: EditableItem) => Promise<void>;
	open: boolean;
	pending: boolean;
}) {
	const identity = useCacheIdentity();
	const [draft, setDraft] = useState<EditableItem | null>(() => (item ? toDraft(item) : null));
	const [isDebt, setIsDebt] = useState(Boolean(item?.debtSplit));
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => debtSplitToInput(item?.debtSplit));
	const [description, setDescription] = useDebouncedInput(item?.description ?? "", () => undefined);
	const payableStatementsQuery = useQuery({
		enabled: identity !== null && open && draft?.type === "EXPENSE",
		queryFn: () => getPayableCreditCardStatements(draft?.creditCardStatementId ?? undefined),
		queryKey: queryKeys.creditCardStatements.payable(identity!, draft?.creditCardStatementId ?? undefined),
	});
	useEffect(() => {
		if (!item || !open) return;
		setDraft(toDraft(item));
		setIsDebt(Boolean(item.debtSplit));
		setDebtSplit(debtSplitToInput(item.debtSplit));
		setDescription(item.description ?? "");
	}, [item, open, setDescription]);
	if (!item || !draft) return null;
	const balanceDestinationAccounts = accounts
		.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
		.toSorted(compareFinancialAccountsByOptionLabel);
	const incomeDestinationAccounts = accounts
		.filter(account => account.type !== "CREDIT_CARD")
		.toSorted(compareFinancialAccountsByOptionLabel);
	const sourceAccounts = getTransactionSourceAccounts(accounts).toSorted(
		compareFinancialAccountsByOptionLabel,
	);
	const primaryAccounts =
		draft.type === "INCOME"
			? incomeDestinationAccounts
			: draft.type === "YIELD"
				? balanceDestinationAccounts
				: sourceAccounts;
	const primaryAccountId =
		draft.type === "INCOME" || draft.type === "YIELD"
			? draft.destinationFinancialAccountId
			: draft.originFinancialAccountId;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar transação importada</DialogTitle>
					<DialogDescription>Altere antes de aprovar as transações do extrato.</DialogDescription>
				</DialogHeader>
				<div className="scrollbar-themed grid min-h-0 gap-4 overflow-y-auto pr-1">
					<TransactionDetailsFields
						amount={String(draft.amount)}
						date={draft.date}
						description={description}
						includeYield
						isHidden={draft.isHidden}
						onAmountChange={amount =>
							setDraft(current => (current ? { ...current, amount: Number(amount) } : current))
						}
						onDateChange={date => setDraft(current => (current ? { ...current, date } : current))}
						onDescriptionChange={setDescription}
						onIsHiddenChange={isHidden => setDraft(current => (current ? { ...current, isHidden } : current))}
						onStoreNameChange={storeName =>
							setDraft(current => (current ? { ...current, storeName } : current))
						}
						onTagIdsChange={tagIds => setDraft(current => (current ? { ...current, tagIds } : current))}
						onTimeChange={time => setDraft(current => (current ? { ...current, time } : current))}
						onTypeChange={type => {
							if (type === "TRANSFER" || type === "YIELD") setIsDebt(false);
							setDraft(current =>
								current
									? {
											...current,
											creditCardStatementId: type === "EXPENSE" ? current.creditCardStatementId : null,
											destinationFinancialAccountId:
												type === "INCOME" || type === "YIELD" || type === "TRANSFER"
													? type === "INCOME" && current.type === "EXPENSE"
														? current.originFinancialAccountId
														: current.destinationFinancialAccountId
													: null,
											originFinancialAccountId:
												type === "INCOME" || type === "YIELD" ? null : current.originFinancialAccountId,
											type,
										}
									: current,
							);
						}}
						showDescription={draft.type !== "YIELD"}
						showStore={draft.type === "EXPENSE"}
						storeName={draft.storeName ?? ""}
						tagIds={draft.tagIds}
						time={draft.time ?? ""}
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
												amount: current.amount || selected?.statement.balanceAmount || current.amount,
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
							searchable
							sortOptions={false}
							value={draft.creditCardStatementId ?? ""}
						/>
					) : null}
					{draft.type !== "TRANSFER" && draft.type !== "YIELD" && !draft.creditCardStatementId ? (
						<div className="grid gap-3 rounded-2xl border p-3">
							<CheckboxField
								checkboxProps={{
									checked: isDebt,
									id: "edit-imported-transaction-is-debt",
									onCheckedChange: checked => setIsDebt(checked === true),
								}}
							>
								<span>Esta movimentação é de uma dívida</span>
							</CheckboxField>
							{isDebt ? (
								<DebtSplitEditor
									amount={draft.amount}
									onChange={setDebtSplit}
									showParticipantDescriptions={draft.type === "EXPENSE"}
									value={debtSplit}
								/>
							) : null}
						</div>
					) : null}
					<CustomSelect
						label={draft.type === "INCOME" || draft.type === "YIELD" ? "Conta de destino" : "Conta de origem"}
						onValueChange={accountId =>
							setDraft(current =>
								current
									? current.type === "INCOME" || current.type === "YIELD"
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
						searchable
						value={primaryAccountId ?? ""}
					/>
					{draft.type === "TRANSFER" ? (
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
							searchable
							value={draft.destinationFinancialAccountId ?? ""}
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
							(isDebt && !calculateDebtSplit(draft.amount, debtSplit)) ||
							(draft.type === "TRANSFER" && !draft.destinationFinancialAccountId) ||
							pending
						}
						onClick={() =>
							onSubmit({
								...draft,
								debtSplit: isDebt ? debtSplit : null,
								description,
								time: draft.time || null,
							})
						}
					>
						{pending ? "Salvando…" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
