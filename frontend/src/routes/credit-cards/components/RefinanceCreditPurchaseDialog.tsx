import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
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
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { CreditPurchase } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";

export function RefinanceCreditPurchaseDialog({
	onOpenChange,
	onSubmit,
	open,
	pending,
	purchase,
}: {
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: { totalAmount: number; installments: number; purchaseDate: string }) => Promise<void>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
}) {
	const currencyCode = purchase.bookingCurrency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const [totalAmount, setTotalAmount] = useState(
		String(purchase.installmentAmount * (purchase.installments - purchase.currentInstallment + 1)),
	);
	const [installments, setInstallments] = useDebouncedInput("12", () => undefined);
	const [purchaseDate, setPurchaseDate] = useState(getLocalDateKey);
	const total = Number(totalAmount);
	const count = Number(installments);
	const balance = purchase.installmentAmount * (purchase.installments - purchase.currentInstallment + 1);
	const valid =
		Number.isFinite(total) &&
		total > 0 &&
		Number.isInteger(count) &&
		count >= 1 &&
		count <= 48 &&
		Boolean(purchaseDate);
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!valid || pending) return;
		try {
			await onSubmit({ installments: count, purchaseDate, totalAmount: total });
			onOpenChange(false);
		} catch {
			// Mutation reports the error; keep the form open for correction.
		}
	};
	return (
		<Dialog onOpenChange={value => !pending && onOpenChange(value)} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Reparcelar compra</DialogTitle>
					<DialogDescription>
						Substitui as parcelas ainda não quitadas. Informe o novo total, incluindo juros e taxas.
					</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" onSubmit={submit}>
					<DialogBody>
						<div className="rounded-xl border bg-muted/30 p-3 text-sm">
							<p className="text-muted-foreground">Saldo restante estimado</p>
							<strong className="text-lg">{currency.format(balance)}</strong>
						</div>
						<MoneyField
							currencyCode={currencyCode}
							id="refinance-credit-purchase-total"
							label="Novo valor total"
							onValueChange={setTotalAmount}
							placeholder="R$ 199,92"
							required
							value={totalAmount}
						/>
						<FormFieldRow>
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
						</FormFieldRow>
						{valid ? (
							<div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
								<strong>
									{count}x de aproximadamente {currency.format(total / count)}
								</strong>
								<p className="mt-1 text-muted-foreground">Total refinanciado: {currency.format(total)}</p>
							</div>
						) : null}
					</DialogBody>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							disabled={pending}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button className="cursor-pointer" disabled={pending || !valid} type="submit">
							{pending ? "Reparcelando…" : "Reparcelar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
