import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decimalToUnits } from "@zaimu/finance/asset-amount";
import { isCryptoAsset } from "@zaimu/finance/money";
import { useEffect, useRef, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { DebtSplitInput, FinancialAccount, FinancialFee, Transaction } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { formatLocalTime } from "@/lib/date";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getPointsConversion,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { getUpdatedStoreName } from "@/lib/store-name";
import { toast } from "@/lib/toast";
import { getTransactionFormAccounts } from "@/lib/transaction-form-accounts";
import { showToast } from "@/stores";
import { TransactionDetailsFields } from "../../TransactionDetailsFields";

function validAssetAmount(value: string, code: string) {
	try {
		return decimalToUnits(value, code) > 0n;
	} catch {
		return false;
	}
}

function createDraft(transaction: Transaction) {
	const fees: FinancialFee[] = transaction.fees ?? [];
	return {
		amount: String(transaction.originalAmount ?? transaction.amount),
		currency: transaction.currency ?? "BRL",
		date: transaction.date.slice(0, 10),
		destinationAmount: transaction.destinationAmount == null ? "" : String(transaction.destinationAmount),
		destinationCurrency: transaction.destinationCurrency ?? "",
		destinationFinancialAccountId: transaction.destinationFinancialAccountId ?? "",
		fees,
		isHidden: transaction.isHidden ?? false,
		originFinancialAccountId: transaction.originFinancialAccountId ?? "",
		paymentAmount: transaction.paymentAmount == null ? "" : String(transaction.paymentAmount),
		paymentCreditCardId: transaction.paymentCreditCardId ?? "",
		storeName: transaction.storeName ?? "",
		tagIds: transaction.tagIds ?? transaction.tags?.map(tag => tag.id) ?? [],
		time: formatLocalTime(transaction.time) ?? "",
		type: transaction.type,
	};
}

export function EditTransactionForm({
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
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => ({
		...debtSplitToInput(transaction?.debtSplit),
		currency: transaction?.bookingCurrency ?? "BRL",
	}));
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

	const initializedTransaction = useRef<string | null>(null);
	useEffect(() => {
		if (!open) {
			initializedTransaction.current = null;
			return;
		}
		if (!transaction || initializedTransaction.current === transaction.id) return;
		initializedTransaction.current = transaction.id;
		setDraft(createDraft(transaction));
		setIsDebt(Boolean(transaction.debtSplit));
		setDebtSplit({
			...debtSplitToInput(transaction.debtSplit),
			currency: transaction.bookingCurrency ?? "BRL",
		});
		setDescription(transaction.description ?? "");
	}, [open, setDescription, transaction]);

	const update = useMutation({
		meta: { cacheOperations: ["transaction"] },
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
				amount: isCryptoAsset(draft.currency) ? draft.amount : Number.parseFloat(draft.amount),
				bookingCurrency: isCryptoAsset(draft.currency)
					? draft.currency
					: (transaction.bookingCurrency ?? draft.currency),
				currency: draft.currency,
				date: draft.date,
				debtSplit: isDebt && !isCryptoAsset(draft.currency) ? debtSplit : null,
				description: description.trim(),
				destinationAmount:
					draft.type === "TRANSFER" && draft.destinationAmount
						? isCryptoAsset(draft.destinationCurrency || draft.currency)
							? draft.destinationAmount
							: Number(draft.destinationAmount)
						: undefined,
				destinationCurrency: draft.destinationCurrency || draft.currency,
				destinationFinancialAccountId: draft.destinationFinancialAccountId || null,
				fees: draft.fees,
				isHidden: draft.isHidden,
				originFinancialAccountId: draft.originFinancialAccountId || null,
				paymentAmount:
					draft.paymentCreditCardId && draft.paymentAmount
						? Number(draft.paymentAmount)
						: undefined,
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
			return { toastId: toast.loading("Salvando transação…") };
		},
		onSuccess: async (_, __, context) => {
			toast.success("Transação atualizada.", { id: context?.toastId, position: "bottom-right" });
		},
	});

	if (!transaction || !draft) return null;
	const balanceDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const pointsConversion = getPointsConversion({
		destination: accountsQuery.data?.find(item => item.id === draft.destinationFinancialAccountId),
		hasCard: Boolean(draft.paymentCreditCardId),
		origin: accountsQuery.data?.find(item => item.id === draft.originFinancialAccountId),
		type: draft.type,
	});
	const counterpartValue =
		pointsConversion.counterpart === "payment" ? draft.paymentAmount : draft.destinationAmount;
	const incomeDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const sourceAccounts = getTransactionSourceAccounts(accountsQuery.data ?? [])
		.filter(account => draft.type !== "TRANSFER" || account.id !== draft.destinationFinancialAccountId)
		.toSorted(compareFinancialAccountsByOptionLabel);
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
				(draft.type === "INCOME" ? transaction.destinationName : transaction.originName) ||
				"Conta atual",
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
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar transação</DialogTitle>
					<DialogDescription>Altere os dados da movimentação.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div>
						<div className="grid min-w-0 grid-cols-1 gap-4 px-1 py-1 pr-3">
							<TransactionDetailsFields
								amount={draft.amount}
								amountIsPoints={pointsConversion.amountIsPoints}
								bookingCurrency={draft.currency}
								counterpart={pointsConversion.counterpart}
								counterpartCurrency={
									pointsConversion.counterpart === "payment"
										? (transaction.paymentCurrency ?? undefined)
										: draft.destinationCurrency || draft.currency
								}
								counterpartIsPoints={pointsConversion.counterpartIsPoints}
								counterpartValue={counterpartValue}
								currencyCode={draft.currency}
								date={draft.date}
								description={description}
								destinationAmount={draft.destinationAmount}
								fees={draft.fees}
								isHidden={draft.isHidden}
								onAmountChange={amount =>
									setDraft(current => (current ? { ...current, amount } : current))
								}
								onCounterpartChange={value =>
									setDraft(
										current =>
											current &&
											(pointsConversion.counterpart === "payment"
												? { ...current, paymentAmount: value }
												: { ...current, destinationAmount: value }),
									)
								}
								onCurrencyChange={currency =>
									setDraft(current => (current ? { ...current, currency } : current))
								}
								onDateChange={date =>
									setDraft(current => (current ? { ...current, date } : current))
								}
								onDescriptionChange={setDescription}
								onDestinationAmountChange={
									draft.type === "TRANSFER"
										? destinationAmount =>
												setDraft(current =>
													current ? { ...current, destinationAmount } : current,
												)
										: undefined
								}
								onDestinationCurrencyChange={
									draft.type === "TRANSFER"
										? destinationCurrency =>
												setDraft(current =>
													current ? { ...current, destinationCurrency } : current,
												)
										: undefined
								}
								onFeesChange={fees =>
									setDraft(current => (current ? { ...current, fees } : current))
								}
								onIsHiddenChange={isHidden =>
									setDraft(current => (current ? { ...current, isHidden } : current))
								}
								onPaymentAmountChange={value =>
									setDraft(current => current && { ...current, paymentAmount: value })
								}
								onStoreNameChange={storeName =>
									setDraft(current => (current ? { ...current, storeName } : current))
								}
								onTagIdsChange={tagIds =>
									setDraft(current => (current ? { ...current, tagIds } : current))
								}
								onTimeChange={time =>
									setDraft(current => (current ? { ...current, time } : current))
								}
								onTypeChange={type => {
									if (type === "YIELD") return;
									if (type === "TRANSFER") setIsDebt(false);
									setDraft(current =>
										current
											? {
													...current,
													...getTransactionFormAccounts(current, type),
													paymentCreditCardId:
														type === "EXPENSE" ? current.paymentCreditCardId : "",
													type,
												}
											: current,
									);
								}}
								paymentAmount={draft.paymentAmount}
								paymentCurrency={
									payableStatementsQuery.data?.find(
										item => item.id === draft.paymentCreditCardId,
									)?.currency
								}
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
									value={draft.paymentCreditCardId}
								/>
							) : null}
							{draft.type !== "TRANSFER" ? (
								<div className="grid gap-3 rounded-2xl border p-3">
									<CheckboxField
										checkboxProps={{
											checked: isDebt,
											disabled: isCryptoAsset(draft.currency),
											id: "edit-transaction-is-debt",
											onCheckedChange: checked => {
												setIsDebt(checked === true);
											},
										}}
									>
										<span>Esta movimentação é de uma dívida</span>
									</CheckboxField>
									{isCryptoAsset(draft.currency) && (
										<p className="text-muted-foreground text-sm">
											Rateios de dívidas exigem moeda fiduciária.
										</p>
									)}
									{isDebt && !isCryptoAsset(draft.currency) ? (
										<DebtSplitEditor
											amount={
												Number(draft.amount) * Number(transaction.exchangeRate ?? 1)
											}
											currencyCode={transaction.bookingCurrency ?? "BRL"}
											onChange={value =>
												setDebtSplit({
													...value,
													currency: transaction.bookingCurrency ?? "BRL",
												})
											}
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
																		: current.destinationFinancialAccountId ===
																			  accountId
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
															account &&
															destinationFinancialAccountId !== account.id
																? account.id
																: current.originFinancialAccountId,
													}
												: current,
										)
									}
									options={[
										...balanceDestinationAccounts
											.filter(account => account.id !== draft.originFinancialAccountId)
											.map(account => ({
												label: getFinancialAccountOptionLabel(account),
												value: account.id,
											})),
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
					</div>
				</DialogBody>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!validAssetAmount(draft.amount, draft.currency) ||
							(isCryptoAsset(draft.currency) &&
								!!draft.paymentCreditCardId &&
								!draft.paymentAmount) ||
							(pointsConversion.counterpart !== null &&
								!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(counterpartValue)) ||
							(draft.type === "TRANSFER" &&
								draft.destinationCurrency !== "" &&
								draft.destinationCurrency !== draft.currency &&
								!validAssetAmount(
									draft.destinationAmount,
									draft.destinationCurrency || draft.currency,
								)) ||
							draft.fees.some(
								fee =>
									!fee.name.trim() || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(fee.amount)),
							) ||
							!primaryAccountId ||
							(isDebt && isCryptoAsset(draft.currency)) ||
							(isDebt &&
								!isCryptoAsset(draft.currency) &&
								!calculateDebtSplit(
									Number(draft.amount) * Number(transaction.exchangeRate ?? 1),
									debtSplit,
									transaction.bookingCurrency ?? "BRL",
								)) ||
							(draft.type === "TRANSFER" && !draft.destinationFinancialAccountId) ||
							update.isPending
						}
						onClick={event => {
							const dialog = event.currentTarget.closest('[role="dialog"]');
							const raw = (id: string) =>
								dialog?.querySelector<HTMLInputElement>(`#${id}-raw`)?.value;
							const rawAmount = raw("transaction-amount");
							const submittedDraft = {
								...draft,
								amount: rawAmount ?? draft.amount,
								destinationAmount:
									raw("transaction-destination-amount") ??
									(pointsConversion.counterpart !== "payment"
										? raw("transaction-counterpart-amount")
										: undefined) ??
									draft.destinationAmount,
								fees: draft.fees.map((fee, index) => ({
									...fee,
									amount: raw(`fee-amount-${index}`) ?? fee.amount,
								})),
								paymentAmount:
									(pointsConversion.counterpart === "payment"
										? raw("transaction-counterpart-amount")
										: undefined) ?? draft.paymentAmount,
							};
							update.mutate({
								debtSplit,
								description,
								draft: submittedDraft,
								isDebt,
								transaction,
							});
						}}
					>
						{update.isPending ? "Salvando…" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
