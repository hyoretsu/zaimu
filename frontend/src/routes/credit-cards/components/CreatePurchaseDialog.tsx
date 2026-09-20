import { type SyntheticEvent, useEffect, useState } from "react";
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
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCard, DebtSplitInput } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { getCurrentLocalTime, getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import { CreditPurchaseFeeFields } from "./CreditPurchaseFeeFields";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

interface PurchaseDraft {
	debtSplit?: DebtSplitInput;
	description: string;
	feeAmount?: number;
	feeDescription?: string;
	storeName?: string;
	installments?: number;
	matchDebtEventId?: string;
	purchaseDate: string;
	time?: string | null;
	tagIds?: string[];
	totalAmount: number;
}

export function CreatePurchaseDialog({
	cards,
	initialCardId,
	onOpenChange,
	onSubmit,
	open,
	pending,
}: {
	cards: CreditCard[];
	initialCardId?: string;
	onOpenChange: (open: boolean) => void;
	onSubmit: (cardId: string, draft: PurchaseDraft) => Promise<void>;
	open: boolean;
	pending: boolean;
}) {
	const [description, setDescription] = useDebouncedInput("", () => undefined);
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>({
		mode: "SHARES",
		ownerShares: null,
		participants: [{ debtPersonId: "", shares: 1 }],
	});
	const [isDebt, setIsDebt] = useState(false);
	const [amount, setAmount] = useState("");
	const [feeAmount, setFeeAmount] = useState("");
	const [feeDescription, setFeeDescription] = useDebouncedInput("", () => undefined);
	const [count, setCount] = useDebouncedInput("1", () => undefined);
	const [date, setDate] = useState(getLocalDateKey);
	const [time, setTime] = useState(getCurrentLocalTime());
	const [sendWithoutTime, setSendWithoutTime] = useState(false);
	useEffect(() => {
		if (!open) return;
		setTime(getCurrentLocalTime());
		setSendWithoutTime(false);
	}, [open]);
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [storeName, setStoreName] = useState("");
	const [cardId, setCardId] = useState(initialCardId ?? "");
	const purchaseAmount = Number(amount || 0);
	const total = purchaseAmount + Number(feeAmount || 0);
	const installmentCount = Number.parseInt(count, 10);
	const installmentValue = total / (installmentCount || 1);
	const reset = () => {
		setDescription("");
		setDebtSplit({ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "", shares: 1 }] });
		setIsDebt(false);
		setAmount("");
		setFeeAmount("");
		setFeeDescription("");
		setCount("1");
		setDate(getLocalDateKey());
		setTime(getCurrentLocalTime());
		setSendWithoutTime(false);
		setTagIds([]);
		setStoreName("");
		setCardId(initialCardId ?? "");
	};
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
		if (!nextOpen) reset();
	};

	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 48) return;
		await onSubmit(cardId, {
			debtSplit: isDebt ? debtSplit : undefined,
			description: description.trim(),
			feeAmount: Number(feeAmount || 0) || undefined,
			feeDescription: feeAmount ? feeDescription.trim() || undefined : undefined,
			installments: installmentCount,
			purchaseDate: date,
			storeName: storeName.trim() || undefined,
			tagIds,
			time: sendWithoutTime ? null : time || undefined,
			totalAmount: total,
		});
		handleOpenChange(false);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<div className="grid gap-6 p-6">
						<DialogHeader>
							<DialogTitle>Nova compra</DialogTitle>
							<DialogDescription>A previsão da fatura é atualizada na hora.</DialogDescription>
						</DialogHeader>
						<form className="grid gap-5" onSubmit={submit}>
							<CustomSelect
								label="Cartão"
								onValueChange={setCardId}
								options={cards.map(card => ({ label: getCreditCardDisplayName(card), value: card.id }))}
								placeholder="Selecione o cartão"
								required
								searchable
								value={cardId}
							/>
							<FormField
								autoComplete="off"
								id="purchase-description"
								label="Descrição"
								name="purchase-description"
								onChange={event => setDescription(event.currentTarget.value)}
								placeholder="Ex: Supermercado do mês"
								type="text"
								value={description}
							/>
							<StorePicker onValueChange={setStoreName} value={storeName} />
							<MoneyField
								id="purchase-amount"
								label="Valor da compra"
								onValueChange={setAmount}
								placeholder="R$ 480,00"
								required
								value={amount}
							/>
							<CreditPurchaseFeeFields
								feeAmount={feeAmount}
								feeDescription={feeDescription}
								onFeeAmountChange={setFeeAmount}
								onFeeDescriptionChange={setFeeDescription}
							/>
							<div className="grid gap-4 sm:grid-cols-3">
								<FormField
									autoComplete="off"
									description="Informe 1 para compra à vista."
									id="purchase-installments"
									inputMode="numeric"
									label="Parcelas"
									name="purchase-installments"
									onChange={event => setCount(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))}
									placeholder="Ex: 12"
									required
									type="text"
									value={count}
								/>
								<DateField
									autoComplete="off"
									id="purchase-date"
									label="Data da compra"
									name="purchase-date"
									onValueChange={setDate}
									required
									value={date}
								/>
								<FormField
									disabled={sendWithoutTime}
									id="purchase-time"
									label="Horário"
									name="purchase-time"
									onChange={event => setTime(event.currentTarget.value)}
									type="time"
									value={sendWithoutTime ? "" : time}
								/>
							</div>
							<CheckboxField
								align="start"
								checkboxProps={{
									checked: sendWithoutTime,
									id: "purchase-without-time",
									onCheckedChange: checked => setSendWithoutTime(checked === true),
								}}
							>
								<span className="font-medium text-foreground-muted">Enviar sem horário</span>
							</CheckboxField>
							<TagPicker onValueChange={setTagIds} value={tagIds} />
							<div className="grid gap-3 rounded-2xl border p-3">
								<CheckboxField
									checkboxProps={{
										checked: isDebt,
										id: "purchase-is-debt",
										onCheckedChange: checked => {
											setIsDebt(checked === true);
										},
									}}
								>
									<span>Esta compra é de uma dívida</span>
								</CheckboxField>
								{isDebt ? <DebtSplitEditor amount={total} onChange={setDebtSplit} value={debtSplit} /> : null}
							</div>
							{total > 0 && (
								<div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
									<strong>{currency.format(total)} no cartão</strong>
									{Number(feeAmount) > 0 ? (
										<p className="mt-1 text-muted-foreground">
											{currency.format(purchaseAmount)} da compra + {feeDescription || "taxa"} de{" "}
											{currency.format(Number(feeAmount))}.
										</p>
									) : null}
									{installmentCount > 1 ? (
										<p className="mt-1 text-muted-foreground">
											{count}x de {currency.format(installmentValue)}. Cada parcela entra na fatura
											correspondente.
										</p>
									) : null}
								</div>
							)}
							<DialogFooter>
								<Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
									Descartar
								</Button>
								<Button
									disabled={
										pending ||
										!cardId ||
										(isDebt && !calculateDebtSplit(total, debtSplit)) ||
										total <= 0 ||
										!Number.isInteger(installmentCount) ||
										installmentCount < 1 ||
										installmentCount > 48
									}
									type="submit"
								>
									{pending ? "Salvando…" : "Salvar compra"}
								</Button>
							</DialogFooter>
						</form>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
