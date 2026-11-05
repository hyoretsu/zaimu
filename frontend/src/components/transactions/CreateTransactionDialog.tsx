import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { DebtSplitInput, FinancialAccount, FinancialFee, Transaction } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { activeCurrency } from "@/lib/currency-context";
import { dataService } from "@/lib/dataService";
import { getCurrentLocalTime, getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getPointsConversion,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { toast } from "@/lib/toast";
import { getTransactionFormAccounts } from "@/lib/transaction-form-accounts";
import { showToast } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";
import { TransactionDetailsFields } from "./TransactionDetailsFields";

const initialDraft = (account?: FinancialAccount) => ({
	amount: "",
	currency: activeCurrency(),
	date: getLocalDateKey(),
	destinationAmount: "",
	destinationFinancialAccountId: "",
	fees: [] as FinancialFee[],
	isHidden: false,
	originFinancialAccountId: "",
	paymentAmount: "",
	paymentCreditCardId: "",
	storeName: "",
	tagIds: [] as string[],
	time: getCurrentLocalTime(),
	type: (account && account.type !== "CHECKING" ? "TRANSFER" : "EXPENSE") as Transaction["type"] | "YIELD",
});

interface CreateTransactionInput {
	debtSplit: DebtSplitInput;
	description: string;
	draft: ReturnType<typeof initialDraft>;
	isDebt: boolean;
}

export function CreateTransactionDialog({
	account,
	onOpenChange,
	open,
}: {
	account?: FinancialAccount;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [draft, setDraft] = useState(() => initialDraft(account));
	const primaryInitialized = useRef(false);
	const currencyExplicit = useRef(false);
	const effectiveCurrency = useCurrencyStore(state => state.currency);
	const [isDebt, setIsDebt] = useState(false);
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>({
		mode: "SHARES",
		ownerShares: null,
		participants: [{ debtPersonId: "", shares: 1 }],
	});
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	useEffect(() => {
		if (!open) return;
		setDraft(current => {
			const isSavingsDestination = account?.type === "SAVINGS" && current.type === "TRANSFER";
			return {
				...current,
				currency:
					!current.amount && !currencyExplicit.current
						? (account?.currency ?? current.currency)
						: current.currency,
				destinationFinancialAccountId: isSavingsDestination
					? account.id
					: current.destinationFinancialAccountId,
				originFinancialAccountId: isSavingsDestination
					? current.originFinancialAccountId === account.id
						? ""
						: current.originFinancialAccountId
					: (account?.id ?? current.originFinancialAccountId),
				time: getCurrentLocalTime(),
			};
		});
	}, [account?.id, open]);
	const accountsQuery = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	useEffect(() => {
		if (!open) {
			primaryInitialized.current = false;
			return;
		}
		if (!accountsQuery.data || primaryInitialized.current) return;
		primaryInitialized.current = true;
		const primary = accountsQuery.data.find(
			candidate => candidate.isPrimary && ["CHECKING", "CASH"].includes(candidate.type),
		);
		if (!account && primary)
			setDraft(current =>
				current.type === "EXPENSE" && !current.originFinancialAccountId
					? { ...current, originFinancialAccountId: primary.id }
					: current,
			);
	}, [open, accountsQuery.data, account]);
	const payableStatementsQuery = useQuery({
		enabled: identity !== null && open && draft.type === "EXPENSE",
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const balanceDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const transferDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const incomeDestinationAccounts =
		accountsQuery.data
			?.filter(account => account.type !== "CREDIT_CARD")
			.toSorted(compareFinancialAccountsByOptionLabel) ?? [];
	const sourceAccounts = getTransactionSourceAccounts(accountsQuery.data ?? [])
		.filter(account => draft.type !== "TRANSFER" || account.id !== draft.destinationFinancialAccountId)
		.toSorted(compareFinancialAccountsByOptionLabel);
	const primaryAccounts =
		draft.type === "INCOME"
			? incomeDestinationAccounts
			: draft.type === "YIELD"
				? balanceDestinationAccounts
				: sourceAccounts;
	const selectedStatement = payableStatementsQuery.data?.find(
		item => item.id === draft.paymentCreditCardId,
	);
	const primaryAccountId =
		draft.type === "INCOME" || draft.type === "YIELD"
			? (account?.id ?? draft.destinationFinancialAccountId)
			: draft.type === "TRANSFER"
				? draft.originFinancialAccountId
				: (account?.id ?? draft.originFinancialAccountId);
	const pointsConversion = getPointsConversion({
		destination: accountsQuery.data?.find(item => item.id === draft.destinationFinancialAccountId),
		hasCard: Boolean(draft.paymentCreditCardId),
		origin: accountsQuery.data?.find(item => item.id === (account?.id ?? draft.originFinancialAccountId)),
		type: draft.type,
	});
	const counterpartValue =
		pointsConversion.counterpart === "payment" ? draft.paymentAmount : draft.destinationAmount;
	useEffect(() => {
		if (!open) return;
		const currency =
			account?.currency ??
			accountsQuery.data?.find(item => item.id === primaryAccountId)?.currency ??
			effectiveCurrency;
		setDraft(current =>
			current.amount || currencyExplicit.current || current.currency === currency
				? current
				: { ...current, currency },
		);
	}, [open, account?.currency, accountsQuery.data, primaryAccountId, effectiveCurrency]);
	const reset = () => {
		currencyExplicit.current = false;
		setDraft(initialDraft(account));
		setDescription("");
		setIsDebt(false);
		setDebtSplit({ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "", shares: 1 }] });
	};
	useDialogCloseReset(open, reset);
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
	};
	const create = useMutation({
		meta: { cacheOperations: ["yield", "transaction"] },
		mutationFn: async ({ debtSplit, description, draft, isDebt }: CreateTransactionInput) => {
			const amount = Number.parseFloat(draft.amount);
			const originFinancialAccountId =
				account && draft.type !== "TRANSFER" ? account.id : draft.originFinancialAccountId;
			const destinationFinancialAccountId =
				account && draft.type !== "TRANSFER" ? account.id : draft.destinationFinancialAccountId;
			if (draft.type === "YIELD") {
				return dataService.accountYields.create({
					amount,
					date: draft.date,
					financialAccountId: destinationFinancialAccountId,
					isHidden: draft.isHidden,
					time: draft.time || null,
				});
			}
			const transaction = await dataService.transactions.create({
				amount,
				currency: draft.currency,
				date: draft.date,
				debtSplit: isDebt ? debtSplit : undefined,
				description: description.trim() || undefined,
				destinationAmount:
					draft.type === "TRANSFER" && draft.destinationAmount
						? Number(draft.destinationAmount)
						: undefined,
				destinationFinancialAccountId:
					draft.type === "INCOME" || draft.type === "TRANSFER"
						? destinationFinancialAccountId || undefined
						: undefined,
				fees: draft.fees,
				isHidden: draft.isHidden,
				originFinancialAccountId:
					draft.type === "INCOME" ? undefined : originFinancialAccountId || undefined,
				paymentAmount:
					draft.paymentCreditCardId && draft.paymentAmount
						? Number(draft.paymentAmount)
						: undefined,
				paymentCreditCardId: draft.paymentCreditCardId || undefined,
				storeName: draft.type === "EXPENSE" ? draft.storeName.trim() || undefined : undefined,
				tagIds: draft.tagIds,
				time: draft.time || null,
				type: draft.type,
			});
			return { statement: null, transaction };
		},
		onError: (error, _, context) => {
			toast.dismiss(context?.toastId);
			showToast(error.message, "negative");
		},
		onMutate: () => {
			handleOpenChange(false);
			return {
				toastId: toast.loading("Salvando transação…"),
			};
		},
		onSuccess: async (_, { draft }, context) => {
			toast.success(
				draft.paymentCreditCardId
					? "Transação associada à fatura."
					: draft.type === "YIELD"
						? "Rendimento registrado."
						: "Transação registrada.",
				{ id: context?.toastId, position: "bottom-right" },
			);
		},
	});
	const save = () => {
		create.mutate({ debtSplit, description, draft, isDebt });
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent
				className="sm:max-w-lg"
				onInputCapture={event => {
					if (event.target instanceof HTMLInputElement && event.target.id === "transaction-amount")
						currencyExplicit.current = true;
				}}
			>
				<DialogHeader>
					<DialogTitle>Nova transação</DialogTitle>
					<DialogDescription>Informe os dados da movimentação.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div>
						<div className="grid min-w-0 grid-cols-1 gap-4 px-1 py-1 pr-3">
							<TransactionDetailsFields
								amount={draft.amount}
								amountIsPoints={pointsConversion.amountIsPoints}
								bookingCurrency={
									account?.currency ??
									accountsQuery.data?.find(
										item =>
											item.id ===
											(draft.type === "INCOME"
												? draft.destinationFinancialAccountId
												: draft.originFinancialAccountId),
									)?.currency ??
									draft.currency
								}
								counterpart={pointsConversion.counterpart}
								counterpartCurrency={
									pointsConversion.counterpart === "payment"
										? selectedStatement?.currency
										: accountsQuery.data?.find(
												item => item.id === draft.destinationFinancialAccountId,
											)?.currency
								}
								counterpartIsPoints={pointsConversion.counterpartIsPoints}
								counterpartValue={counterpartValue}
								currencyCode={
									draft.type === "YIELD"
										? (account?.currency ?? draft.currency)
										: draft.currency
								}
								date={draft.date}
								description={description}
								fees={draft.fees}
								includeYield
								isHidden={draft.isHidden}
								onAmountChange={amount => setDraft(current => ({ ...current, amount }))}
								onCounterpartChange={value =>
									setDraft(current =>
										pointsConversion.counterpart === "payment"
											? { ...current, paymentAmount: value }
											: { ...current, destinationAmount: value },
									)
								}
								onCurrencyChange={
									draft.type !== "YIELD"
										? currency => {
												currencyExplicit.current = true;
												setDraft(current => ({ ...current, currency }));
											}
										: undefined
								}
								onDateChange={date => setDraft(current => ({ ...current, date }))}
								onDescriptionChange={setDescription}
								onFeesChange={
									draft.type !== "YIELD"
										? fees => setDraft(current => ({ ...current, fees }))
										: undefined
								}
								onIsHiddenChange={isHidden => setDraft(current => ({ ...current, isHidden }))}
								onPaymentAmountChange={value =>
									setDraft(current => ({ ...current, paymentAmount: value }))
								}
								onStoreNameChange={storeName =>
									setDraft(current => ({ ...current, storeName }))
								}
								onTagIdsChange={tagIds => setDraft(current => ({ ...current, tagIds }))}
								onTimeChange={time => setDraft(current => ({ ...current, time }))}
								onTypeChange={type => {
									if (type === "TRANSFER") setIsDebt(false);
									setDraft(current => ({
										...current,
										...getTransactionFormAccounts(current, type),
										paymentCreditCardId:
											type === "EXPENSE" ? current.paymentCreditCardId : "",
										type,
									}));
								}}
								paymentAmount={draft.paymentAmount}
								paymentCurrency={selectedStatement?.currency}
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
									label="Cartão para pagar"
									onValueChange={paymentCreditCardId => {
										setDraft(current => ({
											...current,
											paymentCreditCardId,
										}));
										setIsDebt(false);
									}}
									options={(payableStatementsQuery.data ?? []).map(card => ({
										label: getCreditCardDisplayName(card),
										value: card.id,
									}))}
									placeholder="Nenhum cartão selecionado"
									searchable
									value={draft.paymentCreditCardId}
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
											currencyCode={draft.currency}
											onChange={setDebtSplit}
											showParticipantDescriptions={draft.type === "EXPENSE"}
											value={debtSplit}
										/>
									) : null}
								</div>
							) : null}
							{(account === undefined || draft.type === "TRANSFER") &&
								(accountsQuery.isPending || primaryAccounts.length > 0) && (
									<CustomSelect
										disabled={accountsQuery.isPending || accountsQuery.isError}
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
													? {
															...current,
															destinationFinancialAccountId: accountId,
															originFinancialAccountId: "",
														}
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
																	: "",
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
										searchable
										value={primaryAccountId}
									/>
								)}
							{draft.type === "TRANSFER" &&
								(accountsQuery.isPending || transferDestinationAccounts.length > 0) && (
									<CustomSelect
										disabled={accountsQuery.isPending || accountsQuery.isError}
										label="Conta de destino"
										onValueChange={destinationFinancialAccountId =>
											setDraft(current => ({
												...current,
												destinationFinancialAccountId,
												originFinancialAccountId:
													account && destinationFinancialAccountId !== account.id
														? account.id
														: current.originFinancialAccountId,
											}))
										}
										options={transferDestinationAccounts
											.filter(account => account.id !== draft.originFinancialAccountId)
											.map(account => ({
												label: getFinancialAccountOptionLabel(account),
												value: account.id,
											}))}
										placeholder="Selecione o destino"
										required
										searchable
										value={draft.destinationFinancialAccountId}
									/>
								)}
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button
						className="cursor-pointer"
						onClick={() => handleOpenChange(false)}
						variant="outline"
					>
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!draft.amount ||
							draft.fees.some(
								fee => !fee.name.trim() || !Number.isFinite(fee.amount) || fee.amount < 0,
							) ||
							!primaryAccountId ||
							(pointsConversion.counterpart !== null && !Number(counterpartValue)) ||
							(isDebt &&
								!calculateDebtSplit(Number(draft.amount), debtSplit, draft.currency)) ||
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
