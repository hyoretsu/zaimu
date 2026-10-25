import { type SyntheticEvent, useEffect, useState } from "react";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { DebtPersonPicker, DebtSplitEditor } from "@/components/debts";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { DebtSplitInput } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import { parseMaskedMoney } from "@/lib/masked-money";
import { useCurrencyStore } from "@/stores/currency";

interface DebtOriginFields {
	amount: number;
	currency: string;
	date?: null | string;
	description?: string;
	dueDate?: string;
	isOwedToMe: boolean;
}

export interface CreateDebtOriginDraft extends DebtOriginFields {
	debtSplit: DebtSplitInput;
}

export interface UpdateDebtOriginDraft extends DebtOriginFields {
	personId: string;
}

type CreateDebtDialogProps =
	| {
			mode: "create";
			initialDraft?: CreateDebtOriginDraft;
			onOpenChange: (open: boolean) => void;
			onSaved: () => Promise<unknown> | unknown;
			onSubmit: (draft: CreateDebtOriginDraft) => Promise<void>;
			open: boolean;
			pending: boolean;
	  }
	| {
			initialValue: UpdateDebtOriginDraft;
			eventId: string;
			onSaved: () => Promise<unknown> | unknown;
			mode: "edit";
			onOpenChange: (open: boolean) => void;
			onSubmit: (draft: UpdateDebtOriginDraft) => Promise<void>;
			open: boolean;
			pending: boolean;
	  };

const initialDebtSplit = (): DebtSplitInput => ({
	mode: "SHARES",
	ownerShares: null,
	participants: [{ debtPersonId: "", shares: 1 }],
});

export function CreateDebtDialog({ ...props }: CreateDebtDialogProps) {
	const { mode, onOpenChange, open, pending } = props;
	const initialValue = props.mode === "edit" ? props.initialValue : null;
	const recovered = props.mode === "create" ? props.initialDraft : undefined;
	const effectiveCurrency = useCurrencyStore(state => state.currency);
	const [selectedCurrency, setCurrency] = useState<string | null>(null);
	const currency = selectedCurrency ?? initialValue?.currency ?? effectiveCurrency;
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(getLocalDateKey);
	const [sendWithoutDate, setSendWithoutDate] = useState(false);
	const [dueDate, setDueDate] = useState("");
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	const [personId, setPersonId] = useState("");
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(initialDebtSplit);
	const [isOwedToMe, setIsOwedToMe] = useState(true);
	useEffect(() => {
		if (!open || !initialValue) return;
		setAmount(String(initialValue.amount));
		setCurrency(initialValue.currency);
		setDate(initialValue.date?.slice(0, 10) ?? "");
		setSendWithoutDate(!initialValue.date);
		setDueDate(initialValue.dueDate?.slice(0, 10) ?? "");
		setDescription(initialValue.description ?? "");
		setPersonId(initialValue.personId);
		setIsOwedToMe(initialValue.isOwedToMe);
	}, [initialValue, open, setDescription]);
	useEffect(() => {
		if (!open || !recovered) return;
		setAmount(String(recovered.amount));
		setCurrency(recovered.currency);
		setDate(recovered.date ?? "");
		setSendWithoutDate(!recovered.date);
		setDueDate(recovered.dueDate ?? "");
		setDescription(recovered.description ?? "");
		setDebtSplit(recovered.debtSplit);
		setIsOwedToMe(recovered.isOwedToMe);
	}, [open, recovered, setDescription]);
	const reset = () => {
		setAmount("");
		setCurrency(null);
		setDate(getLocalDateKey());
		setSendWithoutDate(false);
		setDueDate("");
		setDescription("");
		setPersonId("");
		setDebtSplit(initialDebtSplit());
		setIsOwedToMe(true);
	};
	useDialogCloseReset(open, reset);
	const handleOpenChange = (nextOpen: boolean) => {
		if (!pending) onOpenChange(nextOpen);
	};
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const fields = {
			amount: parseMaskedMoney(String(form.get("debt-origin-amount") ?? "")),
			currency,
			date: sendWithoutDate ? null : date || undefined,
			description: String(form.get("debt-origin-description") ?? description).trim() || undefined,
			dueDate: dueDate || undefined,
			isOwedToMe,
		};
		if (props.mode === "create") {
			const draft = { ...fields, debtSplit };
			runBackgroundModalAction({
				close: () => onOpenChange(false),
				conflictKey: "debt-create",
				failureMessage: "Não foi possível salvar o lançamento.",
				loadingMessage: "Salvando lançamento...",
				onSuccess: props.onSaved,
				recovery: { kind: "debt-create", payload: draft },
				run: () => props.onSubmit(draft),
				successMessage: "Lançamento adicionado ao saldo.",
			});
			return;
		}
		const draft = { ...fields, personId };
		runBackgroundModalAction({
			close: () => onOpenChange(false),
			conflictKey: `debt-event:${props.eventId}`,
			failureMessage: "Não foi possível atualizar lançamento.",
			loadingMessage: "Atualizando lançamento...",
			onSuccess: props.onSaved,
			recovery: { entityId: props.eventId, kind: "debt-edit", payload: draft },
			run: () => props.onSubmit(draft),
			successMessage: "Lançamento atualizado.",
		});
	};
	const hasValidSplit = Boolean(calculateDebtSplit(Number(amount), debtSplit, currency));

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
				<form className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 p-6" onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>{mode === "edit" ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
						<DialogDescription>
							{mode === "edit"
								? "A alteração recalcula o saldo dos dois participantes."
								: isOwedToMe
									? "Este valor aumenta o total que a pessoa deve a você."
									: "Este valor aumenta o total que você deve à pessoa."}
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div className="grid grid-cols-2 gap-2">
							<Button
								className="cursor-pointer"
								onClick={() => setIsOwedToMe(true)}
								type="button"
								variant={isOwedToMe ? "default" : "outline"}
							>
								Recebimentos
							</Button>
							<Button
								className="cursor-pointer"
								onClick={() => setIsOwedToMe(false)}
								type="button"
								variant={!isOwedToMe ? "destructive" : "outline"}
							>
								Pagamentos
							</Button>
						</div>
						{mode === "edit" ? (
							<DebtPersonPicker onValueChange={setPersonId} required value={personId} />
						) : (
							<DebtSplitEditor
								amount={Number(amount)}
								currencyCode={currency}
								onChange={setDebtSplit}
								showParticipantDescriptions={false}
								value={debtSplit}
							/>
						)}
						<FormFieldRow>
							<CurrencySelect
								disabled={mode === "edit" || pending}
								onValueChange={setCurrency}
								value={currency}
							/>
							<MoneyField
								currencyCode={currency}
								id="debt-origin-amount"
								label="Valor"
								onValueChange={value => {
									if (value && selectedCurrency === null) setCurrency(currency);
									setAmount(value);
								}}
								required
								value={amount}
							/>
						</FormFieldRow>
						<FormFieldRow>
							<DateField
								autoComplete="off"
								disabled={sendWithoutDate}
								id="debt-origin-date"
								label="Data"
								name="debt-origin-date"
								onValueChange={setDate}
								value={sendWithoutDate ? "" : date}
							/>
							<DateField
								autoComplete="off"
								id="debt-origin-due-date"
								label="Vencimento"
								name="debt-origin-due-date"
								onValueChange={setDueDate}
								value={dueDate}
							/>
						</FormFieldRow>
						<CheckboxField
							align="start"
							checkboxProps={{
								checked: sendWithoutDate,
								id: "debt-without-date",
								onCheckedChange: checked => setSendWithoutDate(checked === true),
							}}
						>
							<span className="font-medium text-foreground-muted">Não incluir data</span>
						</CheckboxField>
						<FormField
							autoComplete="off"
							id="debt-origin-description"
							label="Motivo"
							name="debt-origin-description"
							onChange={event => setDescription(event.currentTarget.value)}
							placeholder="Ex: Divisão do aluguel"
							type="text"
							value={description}
						/>
					</DialogBody>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button
							className="cursor-pointer"
							disabled={pending || Number(amount) <= 0 || (mode === "edit" ? !personId : !hasValidSplit)}
							type="submit"
						>
							{pending ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Salvar lançamento"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
