import type { ReactNode } from "react";
import { FormFieldRow } from "@/components/ui/FormFieldRow";

/** Shared field order for every credit card purchase dialog (create, edit and imported edit). */
export function PurchaseFormLayout({
	amount,
	card,
	charge,
	currency,
	date,
	debt,
	description,
	fees,
	installments,
	notices,
	store,
	summary,
	tags,
	taxes,
	time,
}: {
	amount: ReactNode;
	card?: ReactNode;
	charge?: ReactNode;
	currency?: ReactNode;
	date: ReactNode;
	debt: ReactNode;
	description: ReactNode;
	fees?: ReactNode;
	installments: ReactNode;
	notices?: ReactNode;
	store: ReactNode;
	summary?: ReactNode;
	tags: ReactNode;
	taxes?: ReactNode;
	time: ReactNode;
}) {
	return (
		<>
			{card ? <FormFieldRow>{card}</FormFieldRow> : null}
			<FormFieldRow>
				{description}
				{store}
			</FormFieldRow>
			{notices}
			<FormFieldRow>
				{currency}
				{amount}
				{installments}
			</FormFieldRow>
			{fees}
			<FormFieldRow>
				{date}
				{time}
			</FormFieldRow>
			{tags}
			{charge}
			{taxes}
			{debt}
			{summary}
		</>
	);
}
