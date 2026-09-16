import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
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
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditPurchase } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function RefinanceCreditPurchaseDialog({
	onOpenChange,
	onSubmit,
	open,
	pending,
	purchase,
}: {
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: { feeAmount: number; installments: number; purchaseDate: string }) => Promise<void>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
}) {
	const [feeAmount, setFeeAmount] = useState("0");
	const [installments, setInstallments] = useDebouncedInput("12", () => undefined);
	const [purchaseDate, setPurchaseDate] = useState(getLocalDateKey);
	const fee = Number(feeAmount);
	const count = Number.parseInt(installments, 10);
	const balance = purchase.installmentAmount * (purchase.installments - purchase.currentInstallment + 1);
	const total = balance + fee;
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		await onSubmit({ feeAmount: fee, installments: count, purchaseDate });
	};
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Reparcelar compra</DialogTitle>
					<DialogDescription>
						Quita a parcela atual e as próximas. Cria novo parcelamento vinculado, já com a taxa.
					</DialogDescription>
				</DialogHeader>
				<form className="grid gap-5" onSubmit={submit}>
					<div className="rounded-xl border bg-muted/30 p-3 text-sm">
						<p className="text-muted-foreground">Saldo a quitar</p>
						<strong className="text-lg">{currency.format(balance)}</strong>
					</div>
					<MoneyField
						id="refinance-credit-purchase-fee"
						label="Taxa do parcelamento"
						onValueChange={setFeeAmount}
						placeholder="R$ 12,90"
						required
						value={feeAmount}
					/>
					<div className="grid gap-4 sm:grid-cols-2">
						<FormField
							autoComplete="off"
							id="refinance-credit-purchase-installments"
							inputMode="numeric"
							label="Novas parcelas"
							name="refinance-credit-purchase-installments"
							onChange={event => setInstallments(event.currentTarget.value.replace(/\D/g, "").slice(0, 2))}
							placeholder="Ex: 12"
							required
							type="text"
							value={installments}
						/>
						<DateField
							autoComplete="off"
							id="refinance-credit-purchase-date"
							label="Data do novo parcelamento"
							name="refinance-credit-purchase-date"
							onValueChange={setPurchaseDate}
							required
							value={purchaseDate}
						/>
					</div>
					{Number.isInteger(count) && count > 0 && fee >= 0 ? (
						<div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
							<strong>
								{count}x de {currency.format(total / count)}
							</strong>
							<p className="mt-1 text-muted-foreground">Total refinanciado: {currency.format(total)}</p>
						</div>
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
						<Button
							className="cursor-pointer"
							disabled={
								pending || fee < 0 || !Number.isInteger(count) || count < 1 || count > 48 || !purchaseDate
							}
							type="submit"
						>
							{pending ? "Reparcelando…" : "Reparcelar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
