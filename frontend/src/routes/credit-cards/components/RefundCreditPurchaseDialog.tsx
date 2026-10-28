import { useQuery } from "@tanstack/react-query";
import { creditBookEffects, creditBookPlan } from "@zaimu/finance/credit-book";
import { selectRefundInstallments } from "@zaimu/finance/credit-refund";
import { currencyScale } from "@zaimu/finance/money";
import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
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
import { MoneyField } from "@/components/ui/MoneyField";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditPurchase } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { RefundInstallmentOptions } from "./RefundInstallmentOptions";

export function RefundCreditPurchaseDialog({
	onOpenChange,
	onDelete,
	onSubmit,
	open,
	pending,
	purchase,
	refund,
	refundId,
	initialValues,
}: {
	onOpenChange: (open: boolean) => void;
	onDelete?: () => Promise<void>;
	onSubmit: (data: {
		amount?: number;
		date?: string;
		policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";
		canceledInstallmentNumbers?: number[];
	}) => Promise<unknown>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
	refund?: NonNullable<CreditPurchase["refund"]>;
	refundId?: string;
	initialValues?: { amount?: number; date?: string; canceledInstallmentNumbers?: number[] };
}) {
	const currencyCode = purchase.bookingCurrency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const [amount, setAmount] = useState<string | null>(
		initialValues?.amount !== undefined
			? String(initialValues.amount)
			: refund
				? String(refund.amount)
				: null,
	);
	const [date, setDate] = useState<string | null>(
		initialValues?.date ?? refund?.date.slice(0, 10) ?? purchase.refund?.date.slice(0, 10) ?? null,
	);
	const [direction, setDirection] = useState<"FIRST" | "LAST" | null>(null);
	const [mode, setMode] = useState<"credit" | "cancellation" | null>(
		initialValues ? (initialValues.canceledInstallmentNumbers?.length ? "cancellation" : "credit") : null,
	);
	const cardId = purchase.creditCardId;
	const identity = useCacheIdentity();
	const bookQuery = useQuery({
		enabled: open && Boolean(cardId) && Boolean(identity),
		queryFn: () => dataService.creditCards.getBook(cardId!),
		queryKey: queryKeys.creditCards.book(identity!, cardId!),
	});
	const purchaseId = purchase.refundOfPurchaseId ?? purchase.purchaseId ?? purchase.id;
	const bookPurchase = bookQuery.data?.purchases.find(item => item.id === purchaseId);
	const activeRefunds =
		bookQuery.data?.refunds.filter(item => item.purchaseId === purchaseId && !item.deletedAt) ?? [];
	const currentRefund = activeRefunds.find(
		item => item.id === (refundId ?? refund?.id ?? (purchase.isRefund ? purchase.id : undefined)),
	);
	const isEditing = Boolean(refundId || refund || purchase.isRefund);
	const remaining = bookPurchase
		? (bookPurchase.totalAmountCents -
				activeRefunds.reduce((sum, item) => sum + item.amountCents, 0) +
				(currentRefund?.amountCents ?? 0)) /
			currencyScale(currencyCode)
		: (purchase.refundableAmount ?? Math.abs(purchase.totalAmount));
	const displayedAmount =
		amount ??
		(currentRefund
			? String(currentRefund.amountCents / currencyScale(currencyCode))
			: purchase.isRefund
				? String(Math.abs(purchase.refund?.amount ?? purchase.totalAmount))
				: "");
	const amountValue = displayedAmount ? Number(displayedAmount) : undefined;
	const effectiveAmount =
		amountValue ?? (currentRefund ? currentRefund.amountCents / currencyScale(currencyCode) : remaining);
	const scale = currencyScale(currencyCode);
	const originalDate =
		bookPurchase?.purchaseDate ??
		purchase.originalPurchaseDate?.slice(0, 10) ??
		purchase.purchaseDate.slice(0, 10);
	const displayedDate = date ?? currentRefund?.creditDate ?? "";
	const chosenDate = displayedDate || originalDate;
	const plan = bookQuery.data ? creditBookPlan(bookQuery.data) : null;
	const effects = bookQuery.data ? creditBookEffects(bookQuery.data, "9999-12-31") : [];
	const initialSelection =
		initialValues?.canceledInstallmentNumbers ??
		currentRefund?.canceledInstallmentNumbers ??
		effects.find(effect => effect.refundId === currentRefund?.id)?.canceledInstallmentNumbers ??
		[];
	const effectiveMode = mode ?? (initialSelection.length ? "cancellation" : "credit");
	const claimed = new Set(
		effects
			.filter(
				effect =>
					activeRefunds.some(item => item.id === effect.refundId) &&
					effect.refundId !== currentRefund?.id,
			)
			.flatMap(effect => effect.canceledInstallmentNumbers),
	);
	const available =
		plan?.installments.filter(
			item => item.purchaseId === purchaseId && !item.isSettled && !claimed.has(item.number),
		) ?? [];
	const effectiveDirection =
		direction ??
		(initialSelection.includes(available[0]?.number ?? 0) &&
		!initialSelection.includes(available.at(-1)?.number ?? 0)
			? "FIRST"
			: "LAST");
	const canceledInstallmentNumbers =
		effectiveMode === "cancellation" && Number.isFinite(effectiveAmount) && effectiveAmount > 0
			? selectRefundInstallments(available, Math.round(effectiveAmount * scale), effectiveDirection)
			: [];
	const canceledCents = available
		.filter(item => canceledInstallmentNumbers.includes(item.number))
		.reduce((sum, item) => sum + item.amountCents, 0);
	const creditCents = Math.round(effectiveAmount * scale) - canceledCents;

	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			await onSubmit({
				amount: effectiveAmount,
				canceledInstallmentNumbers,
				date: chosenDate,
			});
			onOpenChange(false);
		} catch {
			/* Mutation owner displays the error; preserve fields for correction. */
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Editar reembolso" : "Registrar reembolso"}</DialogTitle>
					<DialogDescription>
						{bookQuery.isPending
							? "Carregando saldo da compra..."
							: bookQuery.isError
								? "Não foi possível carregar a compra. Tente novamente."
								: `Saldo da compra: ${currency.format(remaining)}. Selecione crédito ou cancelamento de parcelas.`}
					</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" onSubmit={submit}>
					<DialogBody>
						{bookQuery.isPending ? (
							<div className="space-y-5">
								<Skeleton className="h-16 rounded-xl" />
								<Skeleton className="h-16 rounded-xl" />
								<Skeleton className="h-28 rounded-xl" />
							</div>
						) : bookQuery.isError ? (
							<p className="text-destructive text-sm" role="alert">
								Não foi possível carregar a compra. Feche e tente novamente.
							</p>
						) : (
							<>
								<MoneyField
									currencyCode={currencyCode}
									id="credit-purchase-refund-amount"
									label="Valor do reembolso"
									onValueChange={setAmount}
									placeholder="R$ 120,00"
									value={displayedAmount}
								/>
								<CustomSelect
									label="Forma do reembolso"
									onValueChange={value => setMode(value as "credit" | "cancellation")}
									options={[
										{ label: "Crédito na fatura", value: "credit" },
										{ label: "Cancelar parcelas", value: "cancellation" },
									]}
									placeholder="Selecione a forma"
									value={effectiveMode}
								/>
								{effectiveMode === "cancellation" ? (
									<RefundInstallmentOptions
										credit={currency
											.format(Math.max(0, creditCents) / scale)
											.replace(/\s/gu, "")}
										direction={effectiveDirection}
										installments={available.map(item => ({
											dueDate: plan!.statements.find(
												statement => statement.id === item.statementId,
											)!.dueDate,
											...item,
											statementDate: plan!.statements.find(
												statement => statement.id === item.statementId,
											)!.statementDate,
										}))}
										onDirectionChange={setDirection}
										selected={canceledInstallmentNumbers}
									/>
								) : null}
								{effectiveMode === "credit" ? (
									<p className="text-muted-foreground text-sm">
										Crédito excedente:{" "}
										{currency
											.format(Math.max(0, creditCents) / scale)
											.replace(/\s/gu, "")}
									</p>
								) : null}
								{creditCents < 0 ? (
									<p className="text-destructive text-sm" role="alert">
										As parcelas selecionadas excedem o valor do reembolso.
									</p>
								) : null}
								<div className="min-w-0 space-y-2">
									<DateField
										autoComplete="off"
										id="credit-purchase-refund-date"
										label="Data do reembolso"
										name="credit-purchase-refund-date"
										onValueChange={setDate}
										value={displayedDate}
									/>
									{!displayedDate && creditCents > 0 ? (
										<p className="text-sm text-amber-600" role="status">
											Sem data informada, o crédito de{" "}
											{currency.format(creditCents / scale)} será lançado em{" "}
											{formatLocalDate(originalDate)}, data da compra original.
										</p>
									) : null}
								</div>
							</>
						)}
					</DialogBody>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						{isEditing && onDelete ? (
							<ConfirmActionButton
								aria-label="Excluir reembolso"
								className="cursor-pointer"
								confirmation="Excluir este reembolso permanentemente?"
								disabled={pending}
								onConfirm={onDelete}
								variant="destructive"
							>
								Excluir
							</ConfirmActionButton>
						) : null}
						<Button
							className="cursor-pointer"
							disabled={
								pending ||
								bookQuery.isPending ||
								bookQuery.isError ||
								!Number.isFinite(effectiveAmount) ||
								effectiveAmount <= 0 ||
								creditCents < 0 ||
								(effectiveMode === "cancellation" && available.length === 0)
							}
							type="submit"
						>
							{pending ? "Salvando..." : isEditing ? "Salvar reembolso" : "Registrar reembolso"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
