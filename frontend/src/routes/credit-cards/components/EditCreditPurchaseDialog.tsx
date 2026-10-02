import { useQuery } from "@tanstack/react-query";
import { type SyntheticEvent, useEffect, useId, useRef, useState } from "react";
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
import { TimeField } from "@/components/ui/TimeField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditCard, CreditPurchase, DebtSplitInput } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { calculateDebtSplit, debtSplitToInput } from "@/lib/debt-split";
import { runDialogSave } from "@/lib/dialog-save";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
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
	cards,
	currentCard,
	onOpenChange,
	onRefund,
	onSubmit,
	open,
	pending,
	purchase,
	creditCardId,
}: {
	cards?: CreditCard[];
	currentCard?: CreditCard;
	creditCardId?: string;
	onOpenChange: (open: boolean) => void;
	onRefund?: () => void;
	onSubmit: (data: CreditPurchaseUpdate) => Promise<unknown>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
}) {
	const identity = useCacheIdentity();
	const sourceCardId = creditCardId ?? purchase.creditCardId;
	const cardsQuery = useQuery({
		enabled: open && Boolean(identity) && !cards && !purchase.parentId && !purchase.isStatementCharge,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const availableCards = cards ?? cardsQuery.data ?? [];
	const cardOptions = availableCards.map(card => ({
		label: getCreditCardDisplayName(card),
		value: card.id,
	}));
	if (sourceCardId && !cardOptions.some(option => option.value === sourceCardId)) {
		cardOptions.unshift({
			label: currentCard ? getCreditCardDisplayName(currentCard) : "Cartão atual",
			value: sourceCardId,
		});
	}
	const canonical = useQuery({
		enabled: open && Boolean(identity) && Boolean(sourceCardId) && !purchase.isStatementCharge,
		queryFn: () =>
			dataService.creditCards.getPurchaseEditDetails(
				sourceCardId!,
				purchase.purchaseId ?? purchase.parentId ?? purchase.id,
			),
		queryKey: [
			...queryKeys.creditCards.all(identity!),
			"purchase-edit",
			sourceCardId,
			purchase.purchaseId ?? purchase.parentId ?? purchase.id,
		],
	});
	const original = canonical.data;
	const cardOptionsUnavailable = Boolean(
		sourceCardId && !purchase.isStatementCharge && (canonical.isPending || canonical.isError),
	);
	const isSynced = purchase.isSynced === true;
	const cardLocked =
		isSynced || Boolean(original?.externalId || original?.installmentImportedNumbers?.length);
	const [selectedCardId, setSelectedCardId] = useState(sourceCardId ?? "");
	const [description, setDescription] = useDebouncedInput(purchase.description, () => undefined);
	const [debtSplit, setDebtSplit] = useState<DebtSplitInput>(() => debtSplitToInput(purchase.debtSplit));
	const [isDebt, setIsDebt] = useState(Boolean(purchase.debtSplit));
	const [amount, setAmount] = useState(
		String(purchase.parentId ? purchase.installmentAmount : purchase.totalAmount - (purchase.feeAmount ?? 0)),
	);
	const [feeAmount, setFeeAmount] = useState(String(purchase.feeAmount ?? ""));
	const [feeDescription, setFeeDescription] = useDebouncedInput(
		purchase.feeDescription ?? "",
		() => undefined,
	);
	const [count, setCount] = useDebouncedInput(String(purchase.installments), () => undefined);
	const [date, setDate] = useState(purchase.purchaseDate.slice(0, 10));
	const amountEdited = useRef(false);
	const dateEdited = useRef(false);
	const [time, setTime] = useState(purchase.time ?? "");
	const [tagIds, setTagIds] = useState(purchase.tagIds ?? []);
	const [storeName, setStoreName] = useState(purchase.storeName ?? "");
	const installmentAmountId = useId();

	useEffect(() => {
		if (!open) return;
		setStoreName(purchase.storeName ?? "");
		setDebtSplit(debtSplitToInput(original?.debtSplit ?? purchase.debtSplit));
		setIsDebt(Boolean(original?.debtSplit ?? purchase.debtSplit));
		setTime(purchase.time ?? "");
		setFeeAmount(String(purchase.feeAmount ?? ""));
		setFeeDescription(purchase.feeDescription ?? "");
	}, [open, original?.debtSplit, purchase.debtSplit, purchase.storeName, purchase.time]);
	useEffect(() => {
		if (open && original && !purchase.parentId) {
			if (!amountEdited.current)
				setAmount(String(original.totalAmountCents / 100 - (original.feeAmount ?? 0)));
			if (!dateEdited.current) setDate(original.purchaseDate);
		}
	}, [open, original?.id, original?.totalAmountCents, original?.purchaseDate]);
	const purchaseAmount = Number(amount);
	const totalAmount = purchaseAmount + Number(feeAmount || 0);
	const installments = Number.parseInt(count, 10);
	if (purchase.parentId)
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
						disabled={isSynced}
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
							onClick={() =>
								runDialogSave(
									onSubmit({ installmentAmount: Number(amount) }),
									() => onOpenChange(false),
									"Salvando compra…",
								)
							}
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
		const operation = onSubmit({
			creditCardId: selectedCardId,
			debtSplit: isDebt && !purchase.isStatementCharge ? debtSplit : null,
			description: description.trim(),
			feeAmount: Number(feeAmount || 0),
			feeDescription: feeAmount ? feeDescription.trim() || undefined : undefined,
			installments,
			purchaseDate: isSynced ? purchase.purchaseDate : date,
			...(updatedStoreName !== undefined && { storeName: updatedStoreName }),
			tagIds,
			time: time || null,
			totalAmount: isSynced
				? original?.totalAmountCents
					? original.totalAmountCents / 100
					: purchase.totalAmount
				: totalAmount,
		});
		runDialogSave(operation, () => onOpenChange(false), "Salvando compra…");
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
								Registrar reembolso
							</Button>
						) : null}
						<form className="grid gap-5" onSubmit={submit}>
							{canonical.isError ? (
								<p className="text-destructive text-sm">Não foi possível verificar a troca de cartão.</p>
							) : null}
							{!purchase.isStatementCharge && sourceCardId ? (
								<CustomSelect
									disabled={
										cardLocked ||
										(!cards && (cardsQuery.isPending || cardsQuery.isError)) ||
										cardOptionsUnavailable
									}
									label="Cartão"
									onValueChange={setSelectedCardId}
									options={cardOptions}
									placeholder="Selecione o cartão"
									required
									searchable
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
								disabled={isSynced}
								id="credit-purchase-amount"
								label="Valor da compra"
								onValueChange={value => {
									amountEdited.current = true;
									setAmount(value);
								}}
								placeholder="R$ 120,00"
								required
								value={amount}
							/>
							<CreditPurchaseFeeFields
								amountDisabled={isSynced}
								feeAmount={feeAmount}
								feeDescription={feeDescription}
								onFeeAmountChange={setFeeAmount}
								onFeeDescriptionChange={setFeeDescription}
							/>
							<div className="grid gap-4 sm:grid-cols-3">
								<FormField
									autoComplete="off"
									disabled={purchase.isStatementCharge}
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
									description={isSynced ? "Compras sincronizadas não permitem alterar a data." : undefined}
									disabled={isSynced}
									id="credit-purchase-date"
									label="Data da compra"
									name="credit-purchase-date"
									onValueChange={value => {
										dateEdited.current = true;
										setDate(value);
									}}
									required
									value={date}
								/>
								<TimeField
									id="credit-purchase-time"
									label="Horário (opcional)"
									name="credit-purchase-time"
									onValueChange={setTime}
									placeholder="Ex: 14:30"
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
										disabled: purchase.isStatementCharge,
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
