import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecurrenceMovement, RecurrenceUnit } from "@zaimu/finance/recurrence";
import { useEffect, useRef, useState } from "react";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
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
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { DebtSplitInput } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { debtSplitToInput } from "@/lib/debt-split";
import { parseMaskedMoney } from "@/lib/masked-money";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import type { Recurrence, RecurrenceInput } from "@/lib/recurrence";
import { type RecurringSaveRecovery, saveRecurrenceWithReplay } from "@/lib/recurrence-save";
import { validateRecurrenceInput } from "@/lib/recurrence-validation";
import { useCurrencyStore } from "@/stores/currency";
import { DebouncedFormField } from "./DebouncedFormField";
import { DebouncedMoneyField } from "./DebouncedMoneyField";
import { RecurrenceAccountFields } from "./RecurrenceAccountFields";
import { RecurrenceNumberField } from "./RecurrenceNumberField";
import { RecurrenceOptionalFields } from "./RecurrenceOptionalFields";
import { RecurrenceScheduleFields } from "./RecurrenceScheduleFields";
import type { RecurringListItemData } from "./types";
import { movementLabels, type UnifiedRecurringDraft } from "./unified-types";

const initialDraft = (recurrence?: Recurrence, currency = "BRL"): UnifiedRecurringDraft => ({
	amount: recurrence ? String(recurrence.amount) : "",
	creditCardId: recurrence?.creditCardId ?? "",
	currency: recurrence?.currency ?? currency,
	currencyExplicit: Boolean(recurrence),
	dayOfMonth: String(
		recurrence?.dayOfMonth ?? Number((recurrence?.startDate ?? getLocalDateKey()).slice(8, 10)),
	),
	dayOfWeek: recurrence?.dayOfWeek == null ? "default" : String(recurrence.dayOfWeek),
	destinationFinancialAccountId: recurrence?.destinationFinancialAccountId ?? "",
	endDate: recurrence?.endDate ?? "",
	installments: String(recurrence?.installments ?? 1),
	interval: String(recurrence?.interval ?? 1),
	movement: recurrence?.movement ?? "EXPENSE",
	name: recurrence?.name ?? "",
	originFinancialAccountId: recurrence?.originFinancialAccountId ?? "",
	startDate: recurrence?.startDate ?? getLocalDateKey(),
	storeName: recurrence?.storeName ?? "",
	tagIds: recurrence?.tagIds ?? [],
	unit: recurrence?.unit ?? "MONTH",
});
type RecurringRecovery = RecurringSaveRecovery<UnifiedRecurringDraft, DebtSplitInput>;
export function CreateRecurringDialog({
	open,
	onOpenChange,
	item,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item?: RecurringListItemData;
}) {
	const recurrence = item?.recurrence;
	const identity = useCacheIdentity();
	const effectiveCurrency = useCurrencyStore(state => state.currency);
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState(() => initialDraft(recurrence, effectiveCurrency));
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => debtSplitToInput(recurrence?.debtSplit));
	const [debtEnabled, setDebtEnabled] = useState(Boolean(recurrence?.debtSplit));
	const [addPast, setAddPast] = useState(false);
	const [validationError, setValidationError] = useState<string>();
	const [completedWrite, setCompletedWrite] = useState(false);
	const [resumeId, setResumeId] = useState<string>();
	const [recoveryId, setRecoveryId] = useState<string>();
	const accounts = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const primaryInitialized = useRef(false);
	const amountEntered = useRef(false);
	useEffect(() => {
		if (!open) {
			primaryInitialized.current = false;
			return;
		}
		if (!accounts.data || primaryInitialized.current || recurrence) return;
		primaryInitialized.current = true;
		const primary = accounts.data.find(
			account => account.isPrimary && ["CHECKING", "CASH"].includes(account.type),
		);
		if (primary)
			setDraft(current =>
				current.movement === "EXPENSE" && !current.originFinancialAccountId
					? {
							...current,
							currency:
								current.amount || amountEntered.current || current.currencyExplicit
									? current.currency
									: (primary.currency ?? "BRL"),
							originFinancialAccountId: primary.id,
						}
					: current,
			);
	}, [open, accounts.data, recurrence]);
	useEffect(() => {
		if (!open || recurrence) return;
		setDraft(current =>
			current.amount ||
			amountEntered.current ||
			current.currencyExplicit ||
			current.originFinancialAccountId ||
			current.destinationFinancialAccountId ||
			current.creditCardId ||
			current.currency === effectiveCurrency
				? current
				: { ...current, currency: effectiveCurrency },
		);
	}, [open, recurrence, effectiveCurrency]);
	useDialogCloseReset(open, () => {
		amountEntered.current = false;
		setValidationError(undefined);
		setDraft(initialDraft(recurrence, effectiveCurrency));
		setDebtSplit(debtSplitToInput(recurrence?.debtSplit));
		setDebtEnabled(Boolean(recurrence?.debtSplit));
		setAddPast(false);
		setResumeId(undefined);
		setRecoveryId(undefined);
		setCompletedWrite(false);
	});
	useBackgroundModalRecovery<RecurringRecovery>("recurrence-save", entry => {
		setRecoveryId(entry.id);
		setDraft(entry.payload.draft);
		setDebtSplit(entry.payload.debtSplit);
		setDebtEnabled(entry.payload.debtEnabled);
		setAddPast(entry.payload.addPast);
		setResumeId(entry.payload.savedId);
		setCompletedWrite(entry.payload.completedWrite);
		onOpenChange(true);
	});
	const set = <K extends keyof UnifiedRecurringDraft>(key: K, value: UnifiedRecurringDraft[K]) =>
		setDraft(current => ({ ...current, [key]: value }));
	const debtAllowed = !["TRANSFER", "CARD_PAYMENT"].includes(draft.movement);
	const save = (recovery: RecurringRecovery) =>
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["recurring"] },
			close: () => onOpenChange(false),
			conflictKey: `recurrence:${recurrence?.id ?? recovery.savedId ?? "new"}`,
			failureMessage: "Não foi possível salvar a recorrência.",
			loadingMessage: recovery.completedWrite ? "Recompondo ocorrências..." : "Salvando recorrência...",
			recovery: { entityId: recurrence?.id ?? recovery.savedId, kind: "recurrence-save", payload: recovery },
			recoveryId,
			run: () =>
				saveRecurrenceWithReplay(recovery, recurrence?.id, dataService.recurrences, getLocalDateKey()),
			successMessage: recurrence ? "Recorrência atualizada." : "Recorrência criada.",
		});
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{recurrence ? "Editar recorrência" : "Adicionar recorrência"}</DialogTitle>
					<DialogDescription>Agende recebimentos, pagamentos, compras ou transferências.</DialogDescription>
				</DialogHeader>
				{accounts.isPending ? (
					<DialogBody>
						<div className="grid gap-4 sm:grid-cols-2">
							{[1, 2, 3, 4, 5, 6].map(key => (
								<Skeleton className="h-20 rounded-xl" key={key} />
							))}
						</div>
					</DialogBody>
				) : accounts.isError ? (
					<DialogBody>
						<p role="alert">Não foi possível carregar contas.</p>
					</DialogBody>
				) : (
					<form
						className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
						onInputCapture={event => {
							if (event.target instanceof HTMLInputElement && event.target.name === "recurrence-amount")
								amountEntered.current = true;
						}}
						onSubmit={event => {
							event.preventDefault();
							const fields = new FormData(event.currentTarget);
							const amountText = String(fields.get("recurrence-amount") ?? draft.amount);
							const amount = parseMaskedMoney(amountText);
							const input = {
								amount,
								creditCardId: ["CARD_PURCHASE", "CARD_PAYMENT"].includes(draft.movement)
									? draft.creditCardId || null
									: null,
								currency: draft.currency,
								dayOfMonth: ["MONTH", "YEAR"].includes(draft.unit)
									? Number(fields.get("recurrence-day") ?? draft.dayOfMonth)
									: null,
								dayOfWeek:
									draft.unit === "WEEK" && draft.dayOfWeek !== "default" ? Number(draft.dayOfWeek) : null,
								debtSplit: debtAllowed && debtEnabled ? debtSplit : null,
								destinationFinancialAccountId: ["INCOME", "TRANSFER"].includes(draft.movement)
									? draft.destinationFinancialAccountId || null
									: null,
								endDate: draft.endDate || null,
								installments:
									draft.movement === "CARD_PURCHASE"
										? Number(fields.get("recurrence-installments") ?? draft.installments)
										: 1,
								interval: Number(fields.get("recurrence-interval") ?? draft.interval),
								isActive: recurrence?.isActive ?? true,
								movement: draft.movement,
								name: String(fields.get("recurrence-name") ?? draft.name).trim(),
								originFinancialAccountId: ["EXPENSE", "TRANSFER", "CARD_PAYMENT"].includes(draft.movement)
									? draft.originFinancialAccountId || null
									: null,
								startDate: draft.startDate,
								storeName: draft.storeName || null,
								tagIds: draft.tagIds,
								unit: draft.unit as RecurrenceUnit,
							} satisfies RecurrenceInput;
							if (!completedWrite) {
								try {
									validateRecurrenceInput(input);
								} catch (error) {
									setValidationError(
										error instanceof Error ? error.message : "Revise os campos obrigatórios.",
									);
									return;
								}
							}
							setValidationError(undefined);
							const submittedDraft = {
								...draft,
								amount: String(amount),
								dayOfMonth: String(fields.get("recurrence-day") ?? draft.dayOfMonth),
								installments: String(fields.get("recurrence-installments") ?? draft.installments),
								interval: String(fields.get("recurrence-interval") ?? draft.interval),
								name: String(fields.get("recurrence-name") ?? draft.name),
							};
							save({
								addPast,
								completedWrite,
								debtEnabled,
								debtSplit,
								draft: submittedDraft,
								input,
								savedId: resumeId,
							});
						}}
					>
						<DialogBody>
							{validationError && (
								<p className="text-destructive text-sm" role="alert">
									{validationError}
								</p>
							)}
							<fieldset className="space-y-5" disabled={completedWrite}>
								<DebouncedFormField
									id="recurrence-name"
									label="Descrição"
									name="recurrence-name"
									onValueChange={value => set("name", value)}
									placeholder="Ex: Recebimento de dívida"
									required
									value={draft.name}
								/>
								<FormFieldRow>
									<CurrencySelect
										label="Moeda da recorrência"
										onValueChange={value =>
											setDraft(current => ({ ...current, currency: value, currencyExplicit: true }))
										}
										value={draft.currency}
									/>
									<DebouncedMoneyField
										currencyCode={draft.currency}
										id="recurrence-amount"
										label={
											draft.movement === "CARD_PURCHASE" ? "Valor total por compra" : "Valor por ocorrência"
										}
										name="recurrence-amount"
										onValueChange={value => set("amount", value)}
										required
										value={draft.amount}
									/>
								</FormFieldRow>
								<div className="grid gap-2">
									<CustomSelect
										disabled={completedWrite}
										label="Movimentação"
										onValueChange={value =>
											setDraft(current => ({
												...current,
												creditCardId: "",
												destinationFinancialAccountId: "",
												movement: value as RecurrenceMovement,
												originFinancialAccountId: "",
											}))
										}
										options={Object.entries(movementLabels).map(([value, label]) => ({ label, value }))}
										placeholder="Selecione movimentação"
										required
										value={draft.movement}
									/>
								</div>

								<RecurrenceAccountFields
									accounts={accounts.data ?? []}
									disabled={completedWrite}
									draft={draft}
									set={set}
								/>
								{draft.movement === "CARD_PURCHASE" && (
									<div className="space-y-2">
										<RecurrenceNumberField
											label="Número de parcelas"
											name="recurrence-installments"
											onChange={value => set("installments", value)}
											placeholder="Ex: 12"
											value={draft.installments}
										/>
										<p className="text-muted-foreground text-sm">
											Cada ocorrência gera uma nova compra pelo valor total, dividida em parcelas mensais. Use
											1 para pagamento à vista.
										</p>
									</div>
								)}
								<RecurrenceScheduleFields disabled={completedWrite} draft={draft} set={set} />
								<RecurrenceOptionalFields
									debtEnabled={debtEnabled}
									debtSplit={debtSplit}
									disabled={completedWrite}
									draft={draft}
									set={set}
									setDebtEnabled={setDebtEnabled}
									setDebtSplit={setDebtSplit}
								/>
								{draft.startDate < getLocalDateKey() && (
									<CheckboxField
										checkboxProps={{
											checked: addPast,
											onCheckedChange: checked => setAddPast(checked === true),
										}}
									>
										Recompor ocorrências passadas inexistentes
									</CheckboxField>
								)}
							</fieldset>
							{completedWrite && (
								<p className="text-muted-foreground text-sm" role="status">
									Recorrência salva. Este envio retoma apenas a recomposição pendente.
								</p>
							)}
						</DialogBody>
						<DialogFooter>
							<Button onClick={() => onOpenChange(false)} type="button" variant="outline">
								Descartar
							</Button>
							<Button type="submit">{completedWrite ? "Retomar recomposição" : "Salvar"}</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
