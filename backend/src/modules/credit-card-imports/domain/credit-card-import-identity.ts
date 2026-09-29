import { createHash } from "node:crypto";
import { withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import type { CreditCardStatementPurchase } from "./credit-card-statement";

const normalize = (value: string) =>
	value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function assignCreditCardPurchaseExternalIds(
	purchases: CreditCardStatementPurchase[],
	creditCardId: string,
) {
	const occurrences = new Map<string, number>();
	const identified = purchases.map(purchase => {
		const financedFee = purchase.description.match(/^(FIN .+?) · IOF R\$ ([\d.]+,\d{2})$/u);
		const identity = [
			"credit-card-import-v1",
			creditCardId,
			purchase.purchaseDate,
			normalize(financedFee?.[1] ?? withoutImportedAnticipation(purchase.description)),
			...(financedFee ? [] : [purchase.installmentAmount.toFixed(2)]),
			String(purchase.installments),
		].join("|");
		const occurrence = (occurrences.get(identity) ?? 0) + 1;
		occurrences.set(identity, occurrence);
		return {
			...purchase,
			externalId: `credit-card:v1:${createHash("sha256").update(`${identity}|${occurrence}`).digest("hex")}`,
		};
	});
	const financingBySourceIndex = new Map(
		identified.flatMap((purchase, index) =>
			purchase.financingSourceIndex === undefined
				? []
				: [[purchase.financingSourceIndex, identified[index]!.externalId] as const],
		),
	);
	return identified.map(({ financingSourceIndex, ...purchase }, index) => {
		const source = financingSourceIndex === undefined ? null : identified[financingSourceIndex]!;
		const financingExternalId = financingBySourceIndex.get(index);
		return {
			...purchase,
			...(source && { financingSourceExternalId: source.externalId }),
			...(financingExternalId && { financingTargetExternalId: financingExternalId }),
		};
	});
}
