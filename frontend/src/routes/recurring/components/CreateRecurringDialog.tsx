import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecurrenceMovement, RecurrenceUnit } from "@zaimu/finance/recurrence";
import { useEffect, useRef, useState } from "react";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
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
import { Skeleton } from "@/components/ui/Skeleton";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { DebtSplitInput } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { debtSplitToInput } from "@/lib/debt-split";
import { parseMaskedMoney } from "@/lib/masked-money";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import type { Recurrence, RecurrenceInput } from "@/lib/recurrence";
import { showToast } from "@/stores";
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
	const [savedRecurrenceId, setSavedRecurrenceId] = useState<string>();
	const [progress, setProgress] = useState("");
	const accounts = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const primaryInitialized = useRef(false);
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
								current.amount || current.currencyExplicit ? current.currency : (primary.currency ?? "BRL"),
							originFinancialAccountId: primary.id,
						}
					: current,
			);
	}, [open, accounts.data, recurrence]);
	useEffect(() => {
		if (!open || recurrence) return;
		setDraft(current =>
			current.amount ||
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
		setDraft(initialDraft(recurrence, effectiveCurrency));
		setDebtSplit(debtSplitToInput(recurrence?.debtSplit));
		setDebtEnabled(Boolean(recurrence?.debtSplit));
		setAddPast(false);
		setSavedRecurrenceId(undefined);
		setProgress("");
	});
	const set = <K extends keyof UnifiedRecurringDraft>(key: K, value: UnifiedRecurringDraft[K]) =>
		setDraft(current => ({ ...current, [key]: value }));
	const debtAllowed = !["TRANSFER", "CARD_PAYMENT"].includes(draft.movement);
	const save = useMutation({
		mutationFn: async (input: RecurrenceInput) => {
			setProgress("Salvando recorrência...");
			const id = recurrence?.id ?? savedRecurrenceId;
			const saved = id
				? await dataService.recurrences.update(id, input)
				: await dataService.recurrences.create(input);
			setSavedRecurrenceId(saved.id);
			if (addPast && input.startDate < getLocalDateKey()) {
				setProgress("Recompondo ocorrências passadas...");
				await dataService.recurrences.replay(saved.id, input.startDate, getLocalDateKey());
			}
		},
		onError: error => {
			setProgress("");
			showToast(error.message, "negative");
		},
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "recurring");
			onOpenChange(false);
			showToast(recurrence ? "Recorrência atualizada." : "Recorrência criada.", "positive");
		},
	});
	return (
		<Dialog
			onOpenChange={next => {
				if (!save.isPending) onOpenChange(next);
			}}
			open={open}
		>
			<DialogContent
				className="w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
				showCloseButton={!save.isPending}
			>
				<ScrollArea className="max-h-[calc(100dvh-2rem)] min-h-0 rounded-4xl [&>[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-2rem)]">
					<div className="space-y-6 p-6">
						<DialogHeader>
							<DialogTitle>{recurrence ? "Editar recorrência" : "Adicionar recorrência"}</DialogTitle>
							<DialogDescription>
								Agende recebimentos, pagamentos, compras ou transferências.
							</DialogDescription>
						</DialogHeader>
						{accounts.isPending ? (
							<div className="grid gap-4 sm:grid-cols-2">
								{[1, 2, 3, 4, 5, 6].map(key => (
									<Skeleton className="h-20 rounded-xl" key={key} />
								))}
							</div>
						) : accounts.isError ? (
							<p role="alert">Não foi possível carregar contas.</p>
						) : (
							<form
								className="space-y-5"
								onInputCapture={event => {
									if (event.target instanceof HTMLInputElement && event.target.name === "recurrence-amount")
										set("currencyExplicit", true);
								}}
								onSubmit={event => {
									event.preventDefault();
									const fields = new FormData(event.currentTarget);
									const amountText = String(fields.get("recurrence-amount") ?? draft.amount);
									const amount = parseMaskedMoney(amountText);
									save.mutate({
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
									});
								}}
							>
								<fieldset
									className="space-y-5"
									disabled={save.isPending}
									onInputCapture={event => {
										if (event.target instanceof HTMLInputElement && event.target.name === "recurrence-amount")
											set("currencyExplicit", true);
									}}
								>
									<div className="grid gap-4 sm:grid-cols-2">
										<DebouncedFormField
											id="recurrence-name"
											label="Descrição"
											name="recurrence-name"
											onValueChange={value => set("name", value)}
											placeholder="Ex: Recebimento de dívida"
											required
											value={draft.name}
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
									</div>
									<div className="grid gap-2">
										<CustomSelect
											disabled={save.isPending}
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
									<CurrencySelect
										label="Moeda da recorrência"
										onValueChange={value =>
											setDraft(current => ({ ...current, currency: value, currencyExplicit: true }))
										}
										value={draft.currency}
									/>
									<RecurrenceAccountFields
										accounts={accounts.data ?? []}
										disabled={save.isPending}
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
												Cada ocorrência gera uma nova compra pelo valor total, dividida em parcelas mensais.
												Use 1 para pagamento à vista.
											</p>
										</div>
									)}
									<RecurrenceScheduleFields disabled={save.isPending} draft={draft} set={set} />
									<RecurrenceOptionalFields
										debtEnabled={debtEnabled}
										debtSplit={debtSplit}
										disabled={save.isPending}
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
								{progress && (
									<p className="text-muted-foreground text-sm" role="status">
										{progress}
									</p>
								)}
								<DialogFooter>
									<Button
										disabled={save.isPending}
										onClick={() => onOpenChange(false)}
										type="button"
										variant="outline"
									>
										Descartar
									</Button>
									<Button disabled={save.isPending} type="submit">
										{save.isPending ? "Salvando..." : "Salvar"}
									</Button>
								</DialogFooter>
							</form>
						)}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
