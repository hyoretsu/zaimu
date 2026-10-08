import { useQuery } from "@tanstack/react-query";
import { creditBookPlan } from "@zaimu/finance/credit-book";
import { purchaseStatementDates } from "@zaimu/finance/credit-purchase";
import { currencyScale } from "@zaimu/finance/money";
import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
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
import { MoneyField } from "@/components/ui/MoneyField";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditPurchase } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export function RefundCreditPurchaseDialog({
	onOpenChange,
	onDelete,
	onSubmit,
	open,
	pending,
	purchase,
	refund,
	refundId,
}: {
	onOpenChange: (open: boolean) => void;
	onDelete?: () => Promise<void>;
	onSubmit: (data: {
		amount?: number;
		date?: string;
		policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";
	}) => Promise<unknown>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
	refund?: NonNullable<CreditPurchase["refund"]>;
	refundId?: string;
}) {
	const currencyCode = purchase.bookingCurrency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const [amount, setAmount] = useState(refund ? String(refund.amount) : "");
	const [date, setDate] = useState(
		refund?.date.slice(0, 10) ?? (purchase.isRefund ? purchase.purchaseDate.slice(0, 10) : getLocalDateKey()),
	);
	const [policy, setPolicy] = useState<"KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS" | undefined>();
	const cardId = purchase.creditCardId;
	const identity = useCacheIdentity();
	const bookQuery = useQuery({
		enabled: open && Boolean(cardId) && Boolean(identity),
		queryFn: () => dataService.creditCards.getBook(cardId!),
		queryKey: queryKeys.creditCards.book(identity!, cardId!),
	});
	const purchaseId = purchase.purchaseId ?? purchase.refundOfPurchaseId ?? purchase.id;
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
	const amountValue = amount ? Number(amount) : undefined;
	const effectiveAmount =
		amountValue ?? (currentRefund ? currentRefund.amountCents / currencyScale(currencyCode) : remaining);
	const chosenDate = date || getLocalDateKey();
	const plan = bookQuery.data ? creditBookPlan(bookQuery.data) : null;
	const creditCycle = bookQuery.data
		? purchaseStatementDates(bookQuery.data.card, chosenDate).statementDate
		: null;
	const hasFutureInstallments =
		plan?.installments.some(
			item =>
				item.purchaseId === purchaseId &&
				!item.isSettled &&
				plan.statements.find(statement => statement.id === item.statementId)!.statementDate > creditCycle!,
		) ?? false;
	const needsPolicy = Boolean(
		bookPurchase &&
			!currentRefund &&
			activeRefunds.length === 0 &&
			Math.round(effectiveAmount * currencyScale(currencyCode)) === bookPurchase.totalAmountCents &&
			hasFutureInstallments,
	);
	const savedPolicy = bookQuery.data?.card.refundPolicy;

	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			await onSubmit({
				amount: effectiveAmount,
				date: chosenDate,
				...(needsPolicy && { policy: savedPolicy ?? policy }),
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
								: `Disponível para reembolso: ${currency.format(remaining)}. Crédito na data efetiva informada.`}
					</DialogDescription>
				</DialogHeader>
				<form className="grid gap-5" onSubmit={submit}>
					{bookQuery.isPending ? <Skeleton className="h-10 rounded-xl" /> : null}
					<MoneyField
						currencyCode={currencyCode}
						id="credit-purchase-refund-amount"
						label="Valor do reembolso"
						onValueChange={setAmount}
						placeholder="R$ 120,00"
						value={amount}
					/>
					<DateField
						autoComplete="off"
						id="credit-purchase-refund-date"
						label="Data do reembolso"
						name="credit-purchase-refund-date"
						onValueChange={setDate}
						required
						value={date}
					/>
					{needsPolicy && !savedPolicy ? (
						<CustomSelect
							label="Como tratar as parcelas futuras?"
							onValueChange={value => setPolicy(value as typeof policy)}
							options={[
								{ label: "Manter parcelas e creditar tudo", value: "KEEP_INSTALLMENTS" },
								{
									label: "Cancelar parcelas futuras e creditar a diferença",
									value: "CANCEL_FUTURE_INSTALLMENTS",
								},
							]}
							placeholder="Selecione uma política"
							required
							value={policy}
						/>
					) : null}
					{needsPolicy && savedPolicy ? (
						<p className="text-muted-foreground text-sm">
							Política da instituição:{" "}
							{savedPolicy === "KEEP_INSTALLMENTS" ? "manter parcelas" : "cancelar parcelas futuras"}.
						</p>
					) : null}
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
								effectiveAmount > remaining ||
								!date ||
								chosenDate > getLocalDateKey() ||
								(needsPolicy && !savedPolicy && !policy)
							}
							type="submit"
						>
							{pending ? "Salvando…" : isEditing ? "Salvar reembolso" : "Registrar reembolso"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
