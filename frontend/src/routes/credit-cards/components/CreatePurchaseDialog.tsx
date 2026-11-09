import { type SyntheticEvent, useEffect, useState } from "react";
import { PurchaseFormLayout } from "@/components/credit-card-purchases";
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
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { TimeField } from "@/components/ui/TimeField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { CreditCard, DebtSplitInput, FinancialFee } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { getCurrentLocalTime, getLocalDateKey } from "@/lib/date";
import { calculateDebtSplit } from "@/lib/debt-split";
import { runDialogSave } from "@/lib/dialog-save";
import { createCurrencyFormatter } from "@/lib/format-currency";
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
	const currency = createCurrencyFormatter(currencyCode);
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
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Nova compra</DialogTitle>
					<DialogDescription>A previsão da fatura é atualizada na hora.</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" onSubmit={submit}>
					<DialogBody>
						<PurchaseFormLayout
							amount={
								<MoneyField
									currencyCode={currencyCode}
									id="purchase-amount"
									label="Valor total"
									onValueChange={value => {
										setAmount(value);
										if (value && selectedCurrency === null) setCurrencyCode(currencyCode);
									}}
									placeholder="R$ 480,00"
									required
									value={amount}
								/>
							}
							card={
								<CustomSelect
									disabled={cardsLoading || cardsError || cards.length === 0}
									label="Cartão"
									onValueChange={setCardId}
									options={cards.map(card => ({
										label: getCreditCardDisplayName(card),
										value: card.id,
									}))}
									placeholder={
										cardsLoading ? "Carregando cartões..." : "Selecione o cartão"
									}
									required
									searchable
									value={cardId}
								/>
							}
							charge={
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
									<span>Encargos da fatura (juros, multa ou IOF)</span>
								</CheckboxField>
							}
							currency={<CurrencySelect onValueChange={setCurrencyCode} value={currencyCode} />}
							date={
								<DateField
									autoComplete="off"
									id="purchase-date"
									label="Data da compra"
									name="purchase-date"
									onValueChange={setDate}
									required
									value={date}
								/>
							}
							debt={
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
							}
							description={
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
							}
							fees={
								<FinancialFeeFields
									baseAmount={Number(amount) || 0}
									currencyCode={currencyCode}
									fees={fees}
									onChange={setFees}
								/>
							}
							installments={
								<FormField
									autoComplete="off"
									description="Informe 1 para compra à vista."
									disabled={isStatementCharge}
									id="purchase-installments"
									inputMode="numeric"
									label="Total de parcelas"
									name="purchase-installments"
									onChange={event =>
										setCount(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))
									}
									placeholder="Ex: 12"
									required
									type="text"
									value={isStatementCharge ? "1" : count}
								/>
							}
							notices={
								cardsError ? (
									<div className="text-muted-foreground flex items-center justify-between gap-3 text-sm">
										<span>Não foi possível carregar cartões.</span>
										{onRetryCards ? (
											<Button onClick={onRetryCards} type="button" variant="outline">
												Tentar novamente
											</Button>
										) : null}
									</div>
								) : !cardsLoading && cards.length === 0 ? (
									<p className="text-muted-foreground text-sm">Nenhum cartão cadastrado.</p>
								) : null
							}
							store={<StorePicker onValueChange={setStoreName} value={storeName} />}
							summary={
								total > 0 ? (
									<div className="border-primary/15 bg-primary/5 rounded-xl border p-3 text-sm">
										<strong>Valor original: {currency.format(total)}</strong>

										{installmentCount > 1 ? (
											<p className="text-muted-foreground mt-1">
												{count}x de {currency.format(installmentValue)}. Cada parcela
												entra na fatura correspondente.
											</p>
										) : null}
									</div>
								) : null
							}
							tags={<TagPicker onValueChange={setTagIds} value={tagIds} />}
							time={
								<TimeField
									id="purchase-time"
									label="Horário"
									name="purchase-time"
									onValueChange={setTime}
									placeholder="Ex: 14:30"
									value={time}
								/>
							}
						/>
					</DialogBody>
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
			</DialogContent>
		</Dialog>
	);
}
