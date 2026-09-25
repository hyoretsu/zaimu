import { type SyntheticEvent, useEffect, useState } from "react";
import { DebtPersonPicker, DebtSplitEditor } from "@/components/debts";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { DebtSplitInput } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import { runDialogSave } from "@/lib/dialog-save";

interface DebtOriginFields {
	amount: number;
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
			onOpenChange: (open: boolean) => void;
			onSubmit: (draft: CreateDebtOriginDraft) => Promise<void>;
			open: boolean;
			pending: boolean;
	  }
	| {
			initialValue: UpdateDebtOriginDraft;
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
		setDate(initialValue.date?.slice(0, 10) ?? "");
		setSendWithoutDate(!initialValue.date);
		setDueDate(initialValue.dueDate?.slice(0, 10) ?? "");
		setDescription(initialValue.description ?? "");
		setPersonId(initialValue.personId);
		setIsOwedToMe(initialValue.isOwedToMe);
	}, [initialValue, open, setDescription]);
	const reset = () => {
		setAmount("");
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
		onOpenChange(nextOpen);
	};
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = {
			amount: Number(amount),
			date: sendWithoutDate ? null : date || undefined,
			description: description.trim() || undefined,
			dueDate: dueDate || undefined,
			isOwedToMe,
		};
		const operation =
			props.mode === "edit"
				? props.onSubmit({ ...fields, personId })
				: props.onSubmit({ ...fields, debtSplit });
		runDialogSave(operation, () => handleOpenChange(false), "Salvando lançamento…");
	};
	const hasValidSplit = Boolean(calculateDebtSplit(Number(amount), debtSplit));

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<form className="grid gap-5 p-6" onSubmit={submit}>
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
								onChange={setDebtSplit}
								showParticipantDescriptions={false}
								value={debtSplit}
							/>
						)}
						<MoneyField
							id="debt-origin-amount"
							label="Valor"
							onValueChange={setAmount}
							required
							value={amount}
						/>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="grid content-start gap-4">
								<DateField
									autoComplete="off"
									disabled={sendWithoutDate}
									id="debt-origin-date"
									label="Data"
									name="debt-origin-date"
									onValueChange={setDate}
									value={sendWithoutDate ? "" : date}
								/>
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
							</div>
							<DateField
								autoComplete="off"
								id="debt-origin-due-date"
								label="Vencimento"
								name="debt-origin-due-date"
								onValueChange={setDueDate}
								value={dueDate}
							/>
						</div>
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
								{pending ? "Salvando…" : mode === "edit" ? "Salvar alterações" : "Salvar lançamento"}
							</Button>
						</DialogFooter>
					</form>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
