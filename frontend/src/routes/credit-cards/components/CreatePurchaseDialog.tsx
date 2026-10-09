import { type SyntheticEvent, useEffect, useState } from "react";
import { CurrencySelect, FinancialFeeFields } from "@/components/currency";
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
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { TimeField } from "@/components/ui/TimeField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { CreditCard, DebtSplitInput, FinancialFee } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { getCurrentLocalTime, getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import { runDialogSave } from "@/lib/dialog-save";
import { useCurrencyStore } from "@/stores/currency";

interface PurchaseDraft {
	isStatementCharge?: boolean;
	debtSplit?: DebtSplitInput;
	description: string;
	currency?: string;
	fees?: FinancialFee[];
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
	cardsError = false,
	cardsLoading = false,
	initialCardId,
	onOpenChange,
	onRetryCards,
	onSubmit,
	open,
	pending,
}: {
	cards: CreditCard[];
	cardsError?: boolean;
	cardsLoading?: boolean;
	initialCardId?: string;
	onOpenChange: (open: boolean) => void;
	onRetryCards?: () => void;
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
	const [isStatementCharge, setIsStatementCharge] = useState(false);
	const [isDebt, setIsDebt] = useState(false);
	const [amount, setAmount] = useState("");
	const effectiveCurrency = useCurrencyStore(state => state.currency);
	const [selectedCurrency, setCurrencyCode] = useState<string | null>(null);
	const [fees, setFees] = useState<FinancialFee[]>([]);

	const [count, setCount] = useDebouncedInput("1", () => undefined);
	const [date, setDate] = useState(getLocalDateKey);
	const [time, setTime] = useState(getCurrentLocalTime());
	useEffect(() => {
		if (!open) return;
		setTime(getCurrentLocalTime());
	}, [open]);
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [storeName, setStoreName] = useState("");
	const [cardId, setCardId] = useState(initialCardId ?? "");
	const currencyCode =
		selectedCurrency ?? cards.find(card => card.id === cardId)?.currency ?? effectiveCurrency;
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	useEffect(() => {
		if (open && initialCardId) setCardId(initialCardId);
	}, [open, initialCardId]);
	const purchaseAmount = Number(amount || 0);
	const total = purchaseAmount;
	const installmentCount = isStatementCharge ? 1 : Number.parseInt(count, 10);
	const installmentValue = total / (installmentCount || 1);
	const reset = () => {
		setDescription("");
		setDebtSplit({ mode: "SHARES", ownerShares: null, participants: [{ debtPersonId: "", shares: 1 }] });
		setIsDebt(false);
		setIsStatementCharge(false);
		setFees([]);
		setCurrencyCode(null);
		setAmount("");
		setCount("1");
		setDate(getLocalDateKey());
		setTime(getCurrentLocalTime());
		setTagIds([]);
		setStoreName("");
		setCardId(initialCardId ?? "");
	};
	useDialogCloseReset(open, reset);
	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen);
	};

	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 48) return;
		const operation = onSubmit(cardId, {
			currency: currencyCode,
			debtSplit: isDebt && !isStatementCharge ? debtSplit : undefined,
			description: description.trim(),
			fees,
			installments: isStatementCharge ? 1 : installmentCount,
			isStatementCharge,
			purchaseDate: date,
			storeName: storeName.trim() || undefined,
			tagIds,
			time: time || null,
			totalAmount: total,
		});
		runDialogSave(operation, () => handleOpenChange(false), "Salvando compra…");
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
							<FormFieldRow>
								<CustomSelect
									disabled={cardsLoading || cardsError || cards.length === 0}
									label="Cartão"
									onValueChange={setCardId}
									options={cards.map(card => ({ label: getCreditCardDisplayName(card), value: card.id }))}
									placeholder={cardsLoading ? "Carregando cartões..." : "Selecione o cartão"}
									required
									searchable
									value={cardId}
								/>
								<StorePicker onValueChange={setStoreName} value={storeName} />
							</FormFieldRow>
							{cardsError ? (
								<div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
									<span>Não foi possível carregar cartões.</span>
									{onRetryCards ? (
										<Button onClick={onRetryCards} type="button" variant="outline">
											Tentar novamente
										</Button>
									) : null}
								</div>
							) : !cardsLoading && cards.length === 0 ? (
								<p className="text-muted-foreground text-sm">Nenhum cartão cadastrado.</p>
							) : null}
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
							<FormFieldRow>
								<CurrencySelect onValueChange={setCurrencyCode} value={currencyCode} />
								<MoneyField
									currencyCode={currencyCode}
									id="purchase-amount"
									label="Valor da compra"
									onValueChange={value => {
										setAmount(value);
										if (value && selectedCurrency === null) setCurrencyCode(currencyCode);
									}}
									placeholder="R$ 480,00"
									required
									value={amount}
								/>
							</FormFieldRow>
							<FinancialFeeFields
								baseAmount={Number(amount) || 0}
								currencyCode={currencyCode}
								fees={fees}
								onChange={setFees}
							/>
							<div className="grid gap-4">
								<FormField
									autoComplete="off"
									description="Informe 1 para compra à vista."
									disabled={isStatementCharge}
									id="purchase-installments"
									inputMode="numeric"
									label="Parcelas"
									name="purchase-installments"
									onChange={event => setCount(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))}
									placeholder="Ex: 12"
									required
									type="text"
									value={isStatementCharge ? "1" : count}
								/>
								<FormFieldRow>
									<DateField
										autoComplete="off"
										id="purchase-date"
										label="Data da compra"
										name="purchase-date"
										onValueChange={setDate}
										required
										value={date}
									/>
									<TimeField
										id="purchase-time"
										label="Horário"
										name="purchase-time"
										onValueChange={setTime}
										placeholder="Ex: 14:30"
										value={time}
									/>
								</FormFieldRow>
							</div>
							<TagPicker onValueChange={setTagIds} value={tagIds} />
							<CheckboxField
								checkboxProps={{
									checked: isStatementCharge,
									id: "purchase-is-charge",
									onCheckedChange: checked => {
										setIsStatementCharge(checked === true);
										if (checked) setIsDebt(false);
									},
								}}
							>
								<span>Encargo da fatura (juros, multa ou IOF)</span>
							</CheckboxField>
							<div className="grid gap-3 rounded-2xl border p-3">
								<CheckboxField
									checkboxProps={{
										checked: isDebt,
										disabled: isStatementCharge,
										id: "purchase-is-debt",
										onCheckedChange: checked => {
											setIsDebt(checked === true);
										},
									}}
								>
									<span>Esta compra é de uma dívida</span>
								</CheckboxField>
								{isDebt ? (
									<DebtSplitEditor
										amount={total}
										currencyCode={currencyCode}
										onChange={setDebtSplit}
										value={debtSplit}
									/>
								) : null}
							</div>
							{total > 0 && (
								<div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
									<strong>Valor original: {currency.format(total)}</strong>

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
										(isDebt && !calculateDebtSplit(total, debtSplit, currencyCode)) ||
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
