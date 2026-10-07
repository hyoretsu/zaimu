import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { DebtSplitInput, FinancialAccount, FinancialFee, Transaction } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { getCurrentLocalTime, getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
	getTransactionSourceAccounts,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { TransactionDetailsFields } from "./TransactionDetailsFields";

const initialDraft = () => ({
	amount: "",
	currency: "BRL",
	date: getLocalDateKey(),
	destinationFinancialAccountId: "",
	fees: [] as FinancialFee[],
	isHidden: false,
	originFinancialAccountId: "",
	paymentCreditCardId: "",
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
	const [draft, setDraft] = useState(initialDraft);
	const primaryInitialized = useRef(false);
	const [isDebt, setIsDebt] = useState(false);
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>({
		mode: "SHARES",
		ownerShares: null,
		participants: [{ debtPersonId: "", shares: 1 }],
	});
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	useEffect(() => {
		if (!open) return;
		setDraft(current => ({
			...current,
			originFinancialAccountId: account?.id ?? current.originFinancialAccountId,
			time: getCurrentLocalTime(),
		}));
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
	const selectedStatement = payableStatementsQuery.data?.find(item => item.id === draft.paymentCreditCardId);
	const primaryAccountId =
		draft.type === "INCOME" || draft.type === "YIELD"
			? (account?.id ?? draft.destinationFinancialAccountId)
			: draft.type === "TRANSFER"
				? draft.originFinancialAccountId
				: (account?.id ?? draft.originFinancialAccountId);
	const reset = () => {
		setDraft(initialDraft());
		setDescription("");
		setIsDebt(false);
		setDebtSplit({ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "", shares: 1 }] });
	};
	useDialogCloseReset(open, reset);
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
	};
	const create = useMutation({
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
				destinationFinancialAccountId:
					draft.type === "INCOME" || draft.type === "TRANSFER"
						? destinationFinancialAccountId || undefined
						: undefined,
				fees: draft.fees,
				isHidden: draft.isHidden,
				originFinancialAccountId: draft.type === "INCOME" ? undefined : originFinancialAccountId || undefined,
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
				toastId: toast.loading("Salvando transação…", { position: "bottom-right" }),
			};
		},
		onSuccess: async (_, { draft }, context) => {
			await invalidateCacheOperation(
				queryClient,
				identity!,
				draft.type === "YIELD" ? "yield" : "transaction",
			);
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
			<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Nova transação</DialogTitle>
					<DialogDescription>Informe os dados da movimentação.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0">
					<div className="grid gap-4 pr-1">
						<TransactionDetailsFields
							amount={draft.amount}
							currencyCode={draft.type === "YIELD" ? "BRL" : draft.currency}
							date={draft.date}
							description={description}
							fees={draft.fees}
							includeYield
							isHidden={draft.isHidden}
							onAmountChange={amount => setDraft(current => ({ ...current, amount }))}
							onCurrencyChange={
								draft.type !== "YIELD"
									? currency => setDraft(current => ({ ...current, currency }))
									: undefined
							}
							onDateChange={date => setDraft(current => ({ ...current, date }))}
							onDescriptionChange={setDescription}
							onFeesChange={
								draft.type !== "YIELD" ? fees => setDraft(current => ({ ...current, fees })) : undefined
							}
							onIsHiddenChange={isHidden => setDraft(current => ({ ...current, isHidden }))}
							onStoreNameChange={storeName => setDraft(current => ({ ...current, storeName }))}
							onTagIdsChange={tagIds => setDraft(current => ({ ...current, tagIds }))}
							onTimeChange={time => setDraft(current => ({ ...current, time }))}
							onTypeChange={type => {
								if (type === "TRANSFER") setIsDebt(false);
								setDraft(current => ({
									...current,
									destinationFinancialAccountId:
										type === "INCOME" || type === "YIELD" || type === "TRANSFER"
											? type === "INCOME" && current.type === "EXPENSE"
												? current.originFinancialAccountId
												: current.destinationFinancialAccountId
											: "",
									originFinancialAccountId:
										type === "INCOME" || type === "YIELD"
											? ""
											: current.originFinancialAccountId || account?.id || "",
									paymentCreditCardId: type === "EXPENSE" ? current.paymentCreditCardId : "",
									type,
								}));
							}}
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
								sortOptions={false}
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
																	: current.destinationFinancialAccountId === accountId
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
							(accountsQuery.isPending || balanceDestinationAccounts.length > 0) && (
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
									options={balanceDestinationAccounts
										.filter(account => account.id !== draft.originFinancialAccountId)
										.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }))}
									placeholder="Selecione o destino"
									required
									searchable
									value={draft.destinationFinancialAccountId}
								/>
							)}
					</div>
				</ScrollArea>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={() => handleOpenChange(false)} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={
							!draft.amount ||
							draft.fees.some(fee => !fee.name.trim() || !Number.isFinite(fee.amount) || fee.amount < 0) ||
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
