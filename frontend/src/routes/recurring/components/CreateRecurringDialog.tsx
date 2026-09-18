import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { DebtSplitEditor } from "@/components/debts";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
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
import type { DebtSplitInput, RecurringPayment, Salary, Subscription } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import {
	compareFinancialAccountsByDisplayName,
	getFinancialAccountDisplayName,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { frequencyOptions, paymentMethodOptions, sourceOptions, weekdayOptions } from "./constants";
import { getCreationSource } from "./creation-source";
import { DebouncedFormField } from "./DebouncedFormField";
import { DebouncedMoneyField } from "./DebouncedMoneyField";
import { PastTransactionsDialog } from "./PastTransactionsDialog";
import { getPastRecurrenceDates } from "./recurrence-dates";
import { getRecurrenceDay, getRecurrenceScheduleDescription } from "./recurrence-schedule";
import type { RecurrenceFrequency, RecurringDraft, RecurringListItemData, RecurringSource } from "./types";

const initialDraft = (item?: RecurringListItemData): RecurringDraft => ({
	amount: item ? String(item.amount) : "",
	day: item?.frequency === "MONTHLY" && item.day ? String(item.day) : "",
	dayOfWeek: item?.dayOfWeek === null || item?.dayOfWeek === undefined ? "default" : String(item.dayOfWeek),
	endDate: item?.endDate?.slice(0, 10) ?? "",
	financialAccountId: item?.financialAccountId ?? "",
	frequency: item?.frequency ?? "MONTHLY",
	name: item?.title ?? "",
	paymentMethod: item?.paymentMethod ?? "CREDIT",
	source: item?.source ?? "subscription",
	startDate: item?.startDate.slice(0, 10) ?? getLocalDateKey(),
	storeName: item?.storeName ?? "",
	tagIds: item?.tags?.map(tag => tag.id) ?? [],
});

const noFinancialAccountValue = "__no-financial-account__";

const initialDebtSplit = (item?: RecurringListItemData) => debtSplitToInput(item?.debtSplit);

const successMessages: Record<RecurringSource, string> = {
	recurring: "Recorrência criada.",
	salary: "Salário criado.",
	subscription: "Assinatura criada.",
};

export function CreateRecurringDialog({
	onOpenChange,
	open,
	item,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	item?: RecurringListItemData;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [draft, setDraft] = useState(() => initialDraft(item));
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => initialDebtSplit(item));
	const [isDebtSplitEnabled, setIsDebtSplitEnabled] = useState(Boolean(item?.debtSplit));
	const isEditing = Boolean(item);
	const [isPastTransactionsDialogOpen, setIsPastTransactionsDialogOpen] = useState(false);
	const accountsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const checkingAndCashAccounts =
		accountsQuery.data
			?.filter(account => account.type === "CHECKING" || account.type === "CASH")
			.toSorted(compareFinancialAccountsByDisplayName) ?? [];
	const compatibleAccounts =
		draft.source === "salary"
			? checkingAndCashAccounts
			: draft.paymentMethod !== "CREDIT"
				? checkingAndCashAccounts
				: (accountsQuery.data
						?.filter(account => account.type === "CREDIT_CARD")
						.toSorted(compareFinancialAccountsByDisplayName) ?? []);
	const selectedCreditCardId = accountsQuery.data?.find(account => account.id === draft.financialAccountId)
		?.creditCard?.id;
	useEffect(() => {
		if (draft.financialAccountId || compatibleAccounts.length !== 1) return;
		setDraft(current =>
			current.financialAccountId ? current : { ...current, financialAccountId: compatibleAccounts[0].id },
		);
	}, [compatibleAccounts, draft.financialAccountId]);
	const setField = <Key extends keyof RecurringDraft>(field: Key, value: RecurringDraft[Key]) => {
		setDraft(current => ({ ...current, [field]: value }));
	};
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
		if (!nextOpen) {
			setDraft(initialDraft(item));
			setDebtSplit(initialDebtSplit(item));
			setIsDebtSplitEnabled(Boolean(item?.debtSplit));
			setIsPastTransactionsDialogOpen(false);
		}
	};

	const create = useMutation<RecurringPayment | Salary | Subscription, Error, boolean>({
		mutationFn: async (addPastTransactions = false) => {
			const amount = Number.parseFloat(draft.amount);
			const creationSource = getCreationSource(draft);
			const selectedDebtSplit = isDebtSplitEnabled ? debtSplit : null;
			const day = getRecurrenceDay(draft.frequency, draft.startDate, draft.day);
			const dayOfWeek =
				draft.frequency === "WEEKLY" && draft.dayOfWeek !== "default"
					? Number.parseInt(draft.dayOfWeek, 10)
					: null;
			if (item) {
				if (item.source === "salary") {
					return dataService.salaries.update(item.id, {
						amount,
						dayOfWeek,
						endDate: draft.endDate || null,
						financialAccountId: draft.financialAccountId,
						frequency: draft.frequency,
						payDay: day,
						source: draft.name.trim(),
						tagIds: draft.tagIds,
					});
				}
				if (item.source === "subscription") {
					return dataService.subscriptions.update(item.id, {
						amount,
						billingDay: day,
						dayOfWeek,
						debtSplit: selectedDebtSplit,
						endDate: draft.endDate || null,
						financialAccountId: draft.financialAccountId || null,
						frequency: draft.frequency,
						name: draft.name.trim(),
						paymentMethod: draft.paymentMethod,
						storeName: draft.storeName.trim() || null,
						tagIds: draft.tagIds,
					});
				}
				return dataService.recurringPayments.update(item.id, {
					amount,
					dayOfMonth: day,
					dayOfWeek,
					debtSplit: selectedDebtSplit,
					endDate: draft.endDate || null,
					financialAccountId: draft.financialAccountId || null,
					frequency: draft.frequency,
					name: draft.name.trim(),
					paymentMethod: draft.paymentMethod,
					storeName: draft.storeName.trim() || null,
					tagIds: draft.tagIds,
				});
			}
			if (draft.source === "salary") {
				const autoGenerateFrom = addPastTransactions ? draft.startDate : format(new Date(), "yyyy-MM-dd");
				const salary = await dataService.salaries.create({
					amount,
					autoGenerateFrom,
					dayOfWeek,
					endDate: draft.endDate || undefined,
					financialAccountId: draft.financialAccountId,
					frequency: draft.frequency,
					payDay: day,
					source: draft.name.trim(),
					startDate: draft.startDate,
					tagIds: draft.tagIds,
				});
				if (addPastTransactions) {
					await Promise.all(
						getPastRecurrenceDates(
							draft.frequency,
							draft.startDate,
							day,
							new Date(),
							draft.endDate || undefined,
							dayOfWeek ?? undefined,
						).map(date =>
							dataService.transactions.create({
								amount,
								date,
								description: draft.name.trim(),
								destinationFinancialAccountId: draft.financialAccountId,
								salaryId: salary.id,
								salaryOccurrenceDate: date,
								time: null,
								type: "INCOME",
							}),
						),
					);
				}
				return salary;
			}
			if (creationSource === "subscription") {
				const subscription = await dataService.subscriptions.create({
					amount,
					billingDay: day,
					dayOfWeek,
					debtSplit: selectedDebtSplit ?? undefined,
					endDate: draft.endDate || undefined,
					financialAccountId: draft.financialAccountId || undefined,
					frequency: draft.frequency,
					name: draft.name.trim(),
					paymentMethod: draft.paymentMethod,
					startDate: draft.startDate,
					storeName: draft.storeName.trim() || undefined,
					tagIds: draft.tagIds,
				});
				if (addPastTransactions) {
					const dates = getPastRecurrenceDates(
						draft.frequency,
						draft.startDate,
						day,
						new Date(),
						draft.endDate || undefined,
						dayOfWeek ?? undefined,
					);
					if (selectedCreditCardId) {
						await Promise.all(
							dates.map(purchaseDate =>
								dataService.creditCards.addPurchase(selectedCreditCardId, {
									debtSplit: selectedDebtSplit ?? undefined,
									description: draft.name.trim(),
									purchaseDate,
									storeName: draft.storeName.trim() || undefined,
									subscriptionId: subscription.id,
									subscriptionOccurrenceDate: purchaseDate,
									tagIds: draft.tagIds,
									time: null,
									totalAmount: amount,
								}),
							),
						);
					} else {
						await Promise.all(
							dates.map(date =>
								dataService.transactions.create({
									amount,
									date,
									debtSplit: selectedDebtSplit ?? undefined,
									description: draft.name.trim(),
									storeName: draft.storeName.trim() || undefined,
									subscriptionId: subscription.id,
									subscriptionOccurrenceDate: date,
									time: null,
									type: "EXPENSE",
								}),
							),
						);
					}
				}
				return subscription;
			}
			const payment = await dataService.recurringPayments.create({
				amount,
				dayOfMonth: day,
				dayOfWeek,
				debtSplit: selectedDebtSplit ?? undefined,
				endDate: draft.endDate || undefined,
				financialAccountId: draft.financialAccountId || undefined,
				frequency: draft.frequency,
				name: draft.name.trim(),
				paymentMethod: draft.paymentMethod,
				startDate: draft.startDate,
				storeName: draft.storeName.trim() || undefined,
				tagIds: draft.tagIds,
			});
			if (addPastTransactions) {
				await Promise.all(
					getPastRecurrenceDates(
						draft.frequency,
						draft.startDate,
						day,
						new Date(),
						draft.endDate || undefined,
						dayOfWeek ?? undefined,
					).map(date =>
						dataService.transactions.create({
							amount,
							date,
							debtSplit: selectedDebtSplit ?? undefined,
							description: draft.name.trim(),
							recurrenceId: payment.id,
							recurrenceOccurrenceDate: date,
							storeName: draft.storeName.trim() || undefined,
							time: null,
							type: "EXPENSE",
						}),
					),
				);
			}
			return payment;
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async (_, addPastTransactions) => {
			await invalidateCacheOperation(queryClient, identity!, "recurring");
			showToast(
				isEditing
					? "Recorrência atualizada."
					: addPastTransactions
						? `${successMessages[getCreationSource(draft)].replace(".", "")} e transações passadas adicionadas.`
						: successMessages[getCreationSource(draft)],
				"positive",
			);
			handleOpenChange(false);
		},
	});

	const nameLabel = draft.source === "salary" ? "Fonte da renda" : "Nome";
	const namePlaceholder =
		draft.source === "salary"
			? "Ex: Empresa Exemplo"
			: draft.source === "subscription"
				? "Ex: Streaming"
				: "Ex: Aluguel";
	const dayLabel = draft.source === "salary" ? "Dia do pagamento" : "Dia da cobrança";
	const day = Number.parseInt(draft.day, 10);
	const dayError =
		draft.frequency === "MONTHLY" && draft.day && (day < 1 || day > 31)
			? "Informe um dia entre 1 e 31."
			: undefined;
	const endDateError =
		draft.endDate && draft.endDate < draft.startDate
			? "A data final deve ser igual ou posterior à inicial."
			: undefined;
	const requiresFinancialAccount = draft.source === "salary" || draft.paymentMethod === "CREDIT";
	const canSubmit =
		draft.name.trim() &&
		draft.amount &&
		(draft.frequency !== "MONTHLY" || draft.day) &&
		!dayError &&
		!endDateError &&
		draft.startDate &&
		(!requiresFinancialAccount || draft.financialAccountId) &&
		(!isDebtSplitEnabled || Boolean(calculateDebtSplit(Number.parseFloat(draft.amount), debtSplit)));
	const isStartDateInPast = draft.startDate < format(new Date(), "yyyy-MM-dd");
	const handleSave = () => {
		if (!isEditing && isStartDateInPast) {
			setIsPastTransactionsDialogOpen(true);
			return;
		}
		create.mutate(false);
	};

	return (
		<>
			<Dialog onOpenChange={handleOpenChange} open={open}>
				<DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{isEditing ? "Editar recorrência" : "Nova recorrência"}</DialogTitle>
						<DialogDescription>
							{isEditing
								? "Atualize os dados da recorrência."
								: "Cadastre uma entrada ou saída que se repete."}
						</DialogDescription>
					</DialogHeader>
					<div className="scrollbar-themed grid min-h-0 min-w-0 max-w-full gap-4 overflow-y-auto overflow-x-hidden pr-1">
						{!isEditing && (
							<CustomSelect
								label="Tipo"
								onValueChange={value =>
									setDraft(current => ({
										...current,
										financialAccountId: "",
										source: value as RecurringSource,
									}))
								}
								options={sourceOptions}
								placeholder="Selecione o tipo"
								required
								value={draft.source}
							/>
						)}
						<DebouncedFormField
							autoComplete={draft.source === "salary" ? "organization" : "off"}
							id="recurring-name"
							label={nameLabel}
							name={draft.source === "salary" ? "organization" : "recurring-name"}
							onValueChange={value => setField("name", value)}
							placeholder={namePlaceholder}
							required
							type="text"
							value={draft.name}
						/>
						<div className="grid gap-4">
							<DebouncedMoneyField
								id="recurring-amount"
								label="Valor"
								onValueChange={value => setField("amount", value)}
								required
								value={draft.amount}
							/>
						</div>
						{draft.source !== "salary" && (
							<div className="grid gap-3">
								<CheckboxField
									checkboxProps={{
										checked: isDebtSplitEnabled,
										onCheckedChange: checked => setIsDebtSplitEnabled(checked === true),
									}}
								>
									Dividir com outras pessoas
								</CheckboxField>
								{isDebtSplitEnabled ? (
									<DebtSplitEditor
										amount={Number.parseFloat(draft.amount) || 0}
										onChange={setDebtSplit}
										value={debtSplit}
									/>
								) : null}
							</div>
						)}
						{draft.source === "salary" && (
							<CustomSelect
								label="Conta de destino"
								onValueChange={value => setField("financialAccountId", value)}
								options={compatibleAccounts.map(account => ({
									label: getFinancialAccountDisplayName(account),
									value: account.id,
								}))}
								placeholder={accountsQuery.isPending ? "Carregando contas…" : "Selecione a conta"}
								required
								value={draft.financialAccountId}
							/>
						)}
						<div
							className={
								draft.frequency === "MONTHLY" || draft.frequency === "WEEKLY"
									? "grid gap-4 sm:grid-cols-2"
									: "grid gap-4"
							}
						>
							<CustomSelect
								label="Frequência"
								onValueChange={value => setField("frequency", value as RecurrenceFrequency)}
								options={frequencyOptions}
								placeholder="Selecione a frequência"
								required
								value={draft.frequency}
							/>
							{draft.frequency === "MONTHLY" && (
								<DebouncedFormField
									autoComplete="off"
									error={dayError}
									id="recurring-day"
									inputMode="numeric"
									label={dayLabel}
									maxLength={2}
									name="recurring-day"
									onValueChange={value => setField("day", value.replace(/\D/g, "").slice(0, 2))}
									placeholder="Ex: 10"
									required
									type="text"
									value={draft.day}
								/>
							)}
							{draft.frequency === "WEEKLY" && (
								<CustomSelect
									label="Dia da semana"
									onValueChange={value => setField("dayOfWeek", value)}
									options={[...weekdayOptions]}
									placeholder="Usar dia da data inicial"
									sortOptions={false}
									value={draft.dayOfWeek}
								/>
							)}
						</div>
						{draft.source !== "salary" && (
							<CustomSelect
								label="Forma de pagamento"
								onValueChange={value =>
									setDraft(current => ({
										...current,
										financialAccountId: "",
										paymentMethod: value as RecurringDraft["paymentMethod"],
									}))
								}
								options={[...paymentMethodOptions]}
								placeholder="Selecione a forma"
								required
								value={draft.paymentMethod}
							/>
						)}
						{draft.source !== "salary" && compatibleAccounts.length > 0 && (
							<CustomSelect
								label={draft.paymentMethod === "CREDIT" ? "Cartão de cobrança" : "Conta de saída"}
								onValueChange={value =>
									setField("financialAccountId", value === noFinancialAccountValue ? "" : value)
								}
								options={[
									...(draft.paymentMethod === "CREDIT"
										? []
										: [{ label: "Sem conta específica", value: noFinancialAccountValue }]),
									...compatibleAccounts.map(account => ({
										label: getFinancialAccountDisplayName(account),
										value: account.id,
									})),
								]}
								placeholder={
									accountsQuery.isPending
										? "Carregando contas…"
										: draft.paymentMethod === "CREDIT"
											? "Selecione o cartão"
											: "Selecione a conta"
								}
								required={draft.paymentMethod === "CREDIT"}
								value={
									draft.financialAccountId ||
									(draft.paymentMethod === "CREDIT" ? undefined : noFinancialAccountValue)
								}
							/>
						)}
						<DateField
							description={
								[
									isEditing ? "Não pode ser alterada após a criação." : "",
									getRecurrenceScheduleDescription(
										draft.frequency,
										draft.startDate,
										draft.dayOfWeek === "default" ? null : Number.parseInt(draft.dayOfWeek, 10),
									),
								]
									.filter(Boolean)
									.join(" ") || undefined
							}
							disabled={isEditing}
							id="recurring-start-date"
							label="Data inicial"
							name="start-date"
							onValueChange={value => setField("startDate", value)}
							required
							value={draft.startDate}
						/>
						<DateField
							description="Deixe vazio para continuar sem prazo."
							error={endDateError}
							id="recurring-end-date"
							label="Data final"
							name="end-date"
							onValueChange={value => setField("endDate", value)}
							value={draft.endDate}
						/>
						<TagPicker onValueChange={tagIds => setField("tagIds", tagIds)} value={draft.tagIds} />
						{draft.source !== "salary" && (
							<StorePicker
								onValueChange={storeName => setField("storeName", storeName)}
								value={draft.storeName}
							/>
						)}
					</div>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={() => handleOpenChange(false)} variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!canSubmit || create.isPending}
							onClick={handleSave}
						>
							{create.isPending ? "Salvando…" : "Salvar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<PastTransactionsDialog
				onAddAll={() => {
					setIsPastTransactionsDialogOpen(false);
					create.mutate(true);
				}}
				onOpenChange={setIsPastTransactionsDialogOpen}
				onSkip={() => {
					setIsPastTransactionsDialogOpen(false);
					create.mutate(false);
				}}
				open={isPastTransactionsDialogOpen}
			/>
		</>
	);
}
