import type { PixCreditOffer } from "@zaimu/finance/loan-comparison";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { OfferCardShell } from "./OfferCardShell";

type Pricing = "RATE" | "INSTALLMENT" | "TOTAL";
export interface PixCardOption {
	id: string;
	name: string;
	closingDay: number;
	dueDay: number;
}

const pricingOf = (offer: PixCreditOffer): Pricing =>
	offer.quotedInstallment != null ? "INSTALLMENT" : offer.quotedTotal != null ? "TOTAL" : "RATE";

export function PixCreditOfferCard({
	cards,
	offer,
	onChange,
	onDuplicate,
	onRemove,
}: {
	cards?: PixCardOption[];
	offer: PixCreditOffer;
	onChange: (offer: PixCreditOffer) => void;
	onDuplicate: () => void;
	onRemove: () => void;
}) {
	const set = <K extends keyof PixCreditOffer>(key: K, value: PixCreditOffer[K]) =>
		onChange({ ...offer, [key]: value });
	const pricing = pricingOf(offer);
	const money = (value: number | null | undefined) => (value ? String(value) : "");
	const card = cards?.find(row => row.closingDay === offer.closingDay && row.dueDay === offer.dueDay);
	return (
		<OfferCardShell
			id={offer.id}
			kindLabel="Pix no crédito"
			name={offer.name}
			onDuplicate={onDuplicate}
			onNameChange={name => set("name", name)}
			onRemove={onRemove}
		>
			<FormFieldRow>
				<MoneyField
					currencyCode={offer.currency}
					id={`${offer.id}-pix-amount`}
					label="Valor do Pix"
					onValueChange={value => set("amount", Number(value || 0))}
					required
					value={money(offer.amount)}
				/>
				<DateField
					id={`${offer.id}-pix-date`}
					label="Data do Pix"
					name={`${offer.id}-pix-date`}
					onValueChange={value => set("pixDate", value)}
					required
					value={offer.pixDate}
				/>
				<NumericField
					decimalScale={0}
					id={`${offer.id}-pix-installments`}
					label="Número de parcelas"
					onValueChange={value => set("installments", Number(value || 0))}
					placeholder="Ex: 12"
					required
					value={String(offer.installments || "")}
				/>
			</FormFieldRow>
			<FormFieldRow>
				<CustomSelect
					label="Condição informada"
					onValueChange={value =>
						onChange({
							...offer,
							monthlyRate: value === "RATE" ? (offer.monthlyRate ?? 0) : null,
							quotedInstallment:
								value === "INSTALLMENT" ? (offer.quotedInstallment ?? 0) : null,
							quotedTotal: value === "TOTAL" ? (offer.quotedTotal ?? 0) : null,
						})
					}
					options={[
						{ label: "Taxa mensal", value: "RATE" },
						{ label: "Valor da parcela", value: "INSTALLMENT" },
						{ label: "Total a pagar", value: "TOTAL" },
					]}
					placeholder="Ex: Valor da parcela"
					required
					value={pricing}
				/>
				{pricing === "RATE" && (
					<NumericField
						id={`${offer.id}-pix-rate`}
						label="Taxa mensal"
						onValueChange={value => set("monthlyRate", Number(value || 0))}
						placeholder="Ex: 4,99%"
						required
						suffix="%"
						value={String(offer.monthlyRate ?? "")}
					/>
				)}
				{pricing === "INSTALLMENT" && (
					<MoneyField
						currencyCode={offer.currency}
						id={`${offer.id}-pix-installment`}
						label="Valor da parcela"
						onValueChange={value => set("quotedInstallment", Number(value || 0))}
						required
						value={money(offer.quotedInstallment)}
					/>
				)}
				{pricing === "TOTAL" && (
					<MoneyField
						currencyCode={offer.currency}
						id={`${offer.id}-pix-total`}
						label="Total a pagar"
						onValueChange={value => set("quotedTotal", Number(value || 0))}
						required
						value={money(offer.quotedTotal)}
					/>
				)}
			</FormFieldRow>
			{pricing === "RATE" && (
				<FormFieldRow>
					<MoneyField
						currencyCode={offer.currency}
						id={`${offer.id}-pix-fee`}
						label="Tarifa financiada"
						onValueChange={value => set("fee", Number(value || 0))}
						value={money(offer.fee)}
					/>
					<MoneyField
						currencyCode={offer.currency}
						id={`${offer.id}-pix-iof`}
						label="IOF financiado"
						onValueChange={value => set("iof", Number(value || 0))}
						value={money(offer.iof)}
					/>
				</FormFieldRow>
			)}
			<FormFieldRow>
				{cards && cards.length > 0 && (
					<CustomSelect
						label="Cartão"
						onValueChange={id => {
							const selected = cards.find(row => row.id === id);
							if (selected)
								onChange({
									...offer,
									closingDay: selected.closingDay,
									dueDay: selected.dueDay,
								});
						}}
						options={cards.map(row => ({ label: row.name, value: row.id }))}
						placeholder="Ex: Cartão Roxinho"
						value={card?.id ?? ""}
					/>
				)}
				<NumericField
					decimalScale={0}
					id={`${offer.id}-pix-closing`}
					label="Dia de fechamento da fatura"
					onValueChange={value => set("closingDay", Number(value || 0))}
					placeholder="Ex: 3"
					required
					value={String(offer.closingDay || "")}
				/>
				<NumericField
					decimalScale={0}
					id={`${offer.id}-pix-due`}
					label="Dia de vencimento da fatura"
					onValueChange={value => set("dueDay", Number(value || 0))}
					placeholder="Ex: 10"
					required
					value={String(offer.dueDay || "")}
				/>
			</FormFieldRow>
			<p className="text-muted-foreground text-xs">
				Parcelas vencem nas faturas seguintes ao Pix e consomem limite do cartão. Antecipar parcelas
				não reduz juros.
			</p>
		</OfferCardShell>
	);
}
