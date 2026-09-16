import { type SyntheticEvent, useEffect, useId, useState } from "react";
import { LuUndo2 } from "react-icons/lu";
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
import type { CreditCard, CreditPurchase, DebtSplitInput } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import { getUpdatedStoreName } from "@/lib/store-name";
import { CreditPurchaseFeeFields } from "./CreditPurchaseFeeFields";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

interface CreditPurchaseDetailsUpdate {
	creditCardId?: string;
	description: string;
	debtSplit?: DebtSplitInput | null;
	feeAmount?: number;
	feeDescription?: string;
	installments: number;
	storeName?: string | null;
	purchaseDate: string;
	time?: string | null;
	tagIds: string[];
	totalAmount: number;
}
type CreditPurchaseUpdate = CreditPurchaseDetailsUpdate | { installmentAmount: number };

export function EditCreditPurchaseDialog({
	onOpenChange,
	onRefund,
	onSubmit,
	open,
	pending,
	purchase,
	cards,
	creditCardId,
}: {
	cards?: CreditCard[];
	creditCardId?: string;
	onOpenChange: (open: boolean) => void;
	onRefund?: () => void;
	onSubmit: (data: CreditPurchaseUpdate) => Promise<unknown>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
}) {
	const [description, setDescription] = useDebouncedInput(purchase.description, () => undefined);
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => debtSplitToInput(purchase.debtSplit));
	const [isDebt, setIsDebt] = useState(Boolean(purchase.debtSplit));
	const [amount, setAmount] = useState(
		String(
			purchase.installments > 1
				? purchase.installmentAmount
				: purchase.totalAmount - (purchase.feeAmount ?? 0),
		),
	);
	const [feeAmount, setFeeAmount] = useState(String(purchase.feeAmount ?? ""));
	const [feeDescription, setFeeDescription] = useDebouncedInput(
		purchase.feeDescription ?? "",
		() => undefined,
	);
	const [count, setCount] = useDebouncedInput(String(purchase.installments), () => undefined);
	const [date, setDate] = useState(purchase.purchaseDate.slice(0, 10));
	const [time, setTime] = useState(purchase.time ?? "");
	const [tagIds, setTagIds] = useState(purchase.tagIds ?? (purchase.categoryId ? [purchase.categoryId] : []));
	const [storeName, setStoreName] = useState(purchase.storeName ?? "");
	const [selectedCardId, setSelectedCardId] = useState(creditCardId ?? "");
	const installmentAmountId = useId();

	useEffect(() => {
		if (!open) return;
		setStoreName(purchase.storeName ?? "");
		setDebtSplit(debtSplitToInput(purchase.debtSplit));
		setIsDebt(Boolean(purchase.debtSplit));
		setTime(purchase.time ?? "");
		setFeeAmount(String(purchase.feeAmount ?? ""));
		setFeeDescription(purchase.feeDescription ?? "");
	}, [open, purchase.debtSplit, purchase.storeName, purchase.time]);
	const purchaseAmount = Number(amount);
	const totalAmount = purchaseAmount + Number(feeAmount || 0);
	const installments = Number.parseInt(count, 10);
	if (purchase.installments > 1)
		return (
			<Dialog onOpenChange={onOpenChange} open={open}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Editar valor da parcela</DialogTitle>
						<DialogDescription>
							Altera somente esta parcela. O total da compra será recalculado pela soma das parcelas.
						</DialogDescription>
					</DialogHeader>
					<MoneyField
						id={installmentAmountId}
						label={`Valor da parcela ${purchase.currentInstallment}/${purchase.installments}`}
						onValueChange={setAmount}
						placeholder="R$ 13,00"
						required
						value={amount}
					/>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={() => onOpenChange(false)} variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={pending || Number(amount) <= 0}
							onClick={() => onSubmit({ installmentAmount: Number(amount) })}
						>
							{pending ? "Salvando…" : "Salvar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	const installmentAmount = totalAmount / (installments || 1);

	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		const updatedStoreName = getUpdatedStoreName(purchase.storeName, storeName);
		await onSubmit({
			...(selectedCardId && selectedCardId !== creditCardId && { creditCardId: selectedCardId }),
			debtSplit: isDebt ? debtSplit : null,
			description: description.trim(),
			feeAmount: Number(feeAmount || 0),
			feeDescription: feeAmount ? feeDescription.trim() || undefined : undefined,
			installments,
			purchaseDate: date,
			...(updatedStoreName !== undefined && { storeName: updatedStoreName }),
			tagIds,
			time: time || null,
			totalAmount,
		});
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<div className="grid gap-6 p-6">
						<DialogHeader>
							<DialogTitle>Editar compra</DialogTitle>
							<DialogDescription>
								As alterações afetam a compra inteira e suas próximas parcelas.
							</DialogDescription>
						</DialogHeader>
						{onRefund ? (
							<Button className="cursor-pointer" onClick={onRefund} type="button" variant="outline">
								<LuUndo2 />
								{purchase.hasRefund ? "Editar reembolso" : "Reembolsar compra"}
							</Button>
						) : null}
						<form className="grid gap-5" onSubmit={submit}>
							{cards?.length && creditCardId ? (
								<CustomSelect
									label="Cartão"
									onValueChange={setSelectedCardId}
									options={cards.map(card => ({ label: getCreditCardDisplayName(card), value: card.id }))}
									placeholder="Selecione o cartão"
									required
									value={selectedCardId}
								/>
							) : null}
							<FormField
								autoComplete="off"
								id="credit-purchase-description"
								label="Descrição"
								name="credit-purchase-description"
								onChange={event => setDescription(event.currentTarget.value)}
								placeholder="Ex: Supermercado do mês"
								type="text"
								value={description}
							/>
							<StorePicker onValueChange={setStoreName} value={storeName} />
							<MoneyField
								id="credit-purchase-amount"
								label="Valor da compra"
								onValueChange={setAmount}
								placeholder="R$ 120,00"
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
									id="credit-purchase-installments"
									inputMode="numeric"
									label="Parcelas"
									name="credit-purchase-installments"
									onChange={event => setCount(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))}
									placeholder="Ex: 12"
									required
									type="text"
									value={count}
								/>
								<DateField
									autoComplete="off"
									id="credit-purchase-date"
									label="Data da compra"
									name="credit-purchase-date"
									onValueChange={setDate}
									required
									value={date}
								/>
								<FormField
									id="credit-purchase-time"
									label="Horário (opcional)"
									name="credit-purchase-time"
									onChange={event => setTime(event.currentTarget.value)}
									type="time"
									value={time}
								/>
							</div>
							{totalAmount > 0 ? (
								<div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
									<strong>{currency.format(totalAmount)} no cartão</strong>
									{Number(feeAmount) > 0 ? (
										<p className="mt-1 text-muted-foreground">
											{currency.format(purchaseAmount)} da compra + {feeDescription || "taxa"} de{" "}
											{currency.format(Number(feeAmount))}.
										</p>
									) : null}
									{installments > 1 ? (
										<p className="mt-1 text-muted-foreground">
											{installments}x de {currency.format(installmentAmount)}.
										</p>
									) : null}
								</div>
							) : null}
							<TagPicker disabled={pending} onValueChange={setTagIds} value={tagIds} />
							<div className="grid gap-3 rounded-2xl border p-3">
								<CheckboxField
									checkboxProps={{
										checked: isDebt,
										id: "edit-purchase-is-debt",
										onCheckedChange: checked => {
											setIsDebt(checked === true);
										},
									}}
								>
									<span>Esta compra é de uma dívida</span>
								</CheckboxField>
								{isDebt ? (
									<DebtSplitEditor amount={totalAmount} onChange={setDebtSplit} value={debtSplit} />
								) : null}
							</div>
							<DialogFooter>
								<Button
									className="cursor-pointer"
									onClick={() => onOpenChange(false)}
									type="button"
									variant="outline"
								>
									Descartar
								</Button>
								<Button
									className="cursor-pointer"
									disabled={
										pending ||
										(isDebt && !calculateDebtSplit(totalAmount, debtSplit)) ||
										totalAmount <= 0 ||
										!Number.isInteger(installments) ||
										installments < 1 ||
										installments > 48 ||
										!date
									}
									type="submit"
								>
									{pending ? "Salvando…" : "Salvar"}
								</Button>
							</DialogFooter>
						</form>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
