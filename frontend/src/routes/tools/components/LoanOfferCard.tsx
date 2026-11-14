import type { LoanComparisonOffer } from "@zaimu/finance/loan-comparison";
import { LuFilePlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { LoanContractFields } from "@/routes/loans/components/LoanContractFields";
import { OfferCardShell } from "./OfferCardShell";

export function LoanOfferCard({
	offer,
	onChange,
	onCreateLoan,
	onDuplicate,
	onRemove,
}: {
	offer: LoanComparisonOffer;
	onChange: (offer: LoanComparisonOffer) => void;
	/** Only offered with an app session: opens the contract editor prefilled. */
	onCreateLoan?: () => void;
	onDuplicate: () => void;
	onRemove: () => void;
}) {
	const quoted = offer.terms.amortization === "PRICE" && !offer.terms.rate.indicator;
	return (
		<OfferCardShell
			id={offer.id}
			kindLabel="Empréstimo"
			name={offer.name}
			onDuplicate={onDuplicate}
			onNameChange={name => onChange({ ...offer, name })}
			onRemove={onRemove}
		>
			<LoanContractFields
				hideCurrency
				idPrefix={`${offer.id}-`}
				onChange={terms => onChange({ ...offer, terms })}
				value={offer.terms}
			/>
			{quoted && (
				<div className="grid gap-1">
					<MoneyField
						currencyCode={offer.terms.currency}
						id={`${offer.id}-quoted-installment`}
						label="Parcela informada pelo banco"
						onValueChange={value =>
							onChange({ ...offer, quotedInstallment: value ? Number(value) : null })
						}
						value={offer.quotedInstallment ? String(offer.quotedInstallment) : ""}
					/>
					<p className="text-muted-foreground text-xs">
						Quando informada, a taxa mensal é calculada a partir da parcela da proposta.
					</p>
				</div>
			)}
			{onCreateLoan && (
				<div className="flex justify-end">
					<Button onClick={onCreateLoan} type="button" variant="outline">
						<LuFilePlus />
						Cadastrar como empréstimo
					</Button>
				</div>
			)}
		</OfferCardShell>
	);
}
