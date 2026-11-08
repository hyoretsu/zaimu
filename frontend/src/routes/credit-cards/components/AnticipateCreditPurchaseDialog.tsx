import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
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
import type { CreditPurchase } from "@/lib/api";
import { getLocalDateKey } from "@/lib/date";

export function AnticipateCreditPurchaseDialog({
	initialValues,
	onOpenChange,
	onSubmit,
	open,
	pending,
	purchase,
}: {
	initialValues?: { anticipationDate?: string; discount?: number; installmentNumbers?: number[] };
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: {
		anticipationDate: string;
		discount?: number;
		installmentNumbers: number[];
	}) => Promise<void>;
	open: boolean;
	pending: boolean;
	purchase: CreditPurchase;
}) {
	const currencyCode = purchase.bookingCurrency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const remaining = Array.from(
		{ length: Math.max(0, purchase.installments - purchase.currentInstallment) },
		(_, index) => purchase.currentInstallment + index + 1,
	);
	const [selected, setSelected] = useState<number[]>(initialValues?.installmentNumbers ?? []);
	const [anticipationDate, setAnticipationDate] = useState(
		initialValues?.anticipationDate ?? getLocalDateKey(),
	);
	const [discount, setDiscount] = useState(initialValues?.discount ? String(initialValues.discount) : "");
	const discountValue = discount ? Number(discount) : undefined;
	const estimated = selected.length * purchase.installmentAmount;
	const valid =
		selected.length > 0 &&
		Boolean(anticipationDate) &&
		(discountValue === undefined ||
			(Number.isFinite(discountValue) && discountValue > 0 && discountValue < estimated));
	const toggle = (number: number, checked: boolean) =>
		setSelected(current =>
			checked ? [...current, number].toSorted((a, b) => a - b) : current.filter(n => n !== number),
		);
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!valid || pending) return;
		try {
			await onSubmit({ anticipationDate, discount: discountValue, installmentNumbers: selected });
			onOpenChange(false);
		} catch {
			// Mutation reports the error; keep the form open for correction.
		}
	};
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Antecipar parcelas</DialogTitle>
					<DialogDescription>
						As parcelas escolhidas passam para a fatura da data da antecipação. O desconto, se
						houver, é lançado como crédito nessa mesma data.
					</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" onSubmit={submit}>
					<DialogBody>
						<div className="grid gap-1">
							<span className="text-sm font-medium">Parcelas a antecipar</span>
							<div className="flex flex-wrap gap-1">
								{remaining.map(number => (
									<CheckboxField
										checkboxProps={{
											checked: selected.includes(number),
											id: `anticipate-installment-${number}`,
											onCheckedChange: checked => toggle(number, checked === true),
										}}
										key={number}
									>
										{number}/{purchase.installments}
									</CheckboxField>
								))}
							</div>
						</div>
						<DateField
							autoComplete="off"
							id="anticipate-credit-purchase-date"
							label="Data da antecipação"
							name="anticipate-credit-purchase-date"
							onValueChange={setAnticipationDate}
							required
							value={anticipationDate}
						/>
						<MoneyField
							currencyCode={currencyCode}
							id="anticipate-credit-purchase-discount"
							label="Desconto obtido (opcional)"
							onValueChange={setDiscount}
							placeholder="R$ 5,71"
							value={discount}
						/>
						{selected.length ? (
							<div className="border-primary/15 bg-primary/5 rounded-xl border p-3 text-sm">
								<strong>
									{selected.length} {selected.length === 1 ? "parcela" : "parcelas"},
									aproximadamente {currency.format(estimated)}
								</strong>
								{discountValue && discountValue < estimated ? (
									<p className="text-muted-foreground mt-1">
										Após o desconto: {currency.format(estimated - discountValue)}
									</p>
								) : null}
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
							{pending ? "Antecipando..." : "Antecipar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
