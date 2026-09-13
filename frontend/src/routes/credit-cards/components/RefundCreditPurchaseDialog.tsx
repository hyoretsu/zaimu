import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
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
import type { CreditPurchase } from "@/lib/api";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function RefundCreditPurchaseDialog({
	onOpenChange,
	onDelete,
	onSubmit,
	open,
	pending,
	purchase,
	refund,
}: {
	onOpenChange: (open: boolean) => void;
	onDelete?: () => Promise<void>;
	onSubmit: (data: { amount?: number; date?: string }) => Promise<unknown>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
	refund?: NonNullable<CreditPurchase["refund"]>;
}) {
	const [amount, setAmount] = useState(refund ? String(refund.amount) : "");
	const [date, setDate] = useState(
		refund?.date.slice(0, 10) === purchase.purchaseDate.slice(0, 10) ? "" : (refund?.date.slice(0, 10) ?? ""),
	);
	const amountValue = amount ? Number(amount) : undefined;

	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		await onSubmit({ ...(amountValue !== undefined && { amount: amountValue }), ...(date && { date }) });
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{refund ? "Editar reembolso" : "Registrar reembolso"}</DialogTitle>
					<DialogDescription>
						Deixe o valor em branco para devolver {currency.format(Math.abs(purchase.totalAmount))}. Sem data,
						o crédito entra junto da compra original.
					</DialogDescription>
				</DialogHeader>
				<form className="grid gap-5" onSubmit={submit}>
					<MoneyField
						id="credit-purchase-refund-amount"
						label="Valor do reembolso (opcional)"
						onValueChange={setAmount}
						placeholder="R$ 120,00"
						value={amount}
					/>
					<DateField
						autoComplete="off"
						id="credit-purchase-refund-date"
						label="Data do reembolso (opcional)"
						name="credit-purchase-refund-date"
						onValueChange={setDate}
						value={date}
					/>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						{refund && onDelete ? (
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
							disabled={pending || (amountValue !== undefined && amountValue <= 0)}
							type="submit"
						>
							{pending ? "Salvando…" : refund ? "Salvar reembolso" : "Registrar reembolso"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
