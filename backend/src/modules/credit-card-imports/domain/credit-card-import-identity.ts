import { createHash } from "node:crypto";
import type { CreditCardStatementPurchase } from "./credit-card-statement";

const normalize = (value: string) =>
	value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function assignCreditCardPurchaseExternalIds(
	purchases: CreditCardStatementPurchase[],
	creditCardId: string,
) {
	const occurrences = new Map<string, number>();
	return purchases.map(purchase => {
		const financedFee = purchase.description.match(/^(FIN .+?) · IOF R\$ ([\d.]+,\d{2})$/u);
		const fee = financedFee ? Number(financedFee[2]!.replace(/\./g, "").replace(",", ".")) : 0;
		const identity = [
			"credit-card-import-v1",
			creditCardId,
			purchase.purchaseDate,
			normalize(financedFee?.[1] ?? purchase.description),
			(purchase.installmentAmount - fee).toFixed(2),
			String(purchase.installments),
		].join("|");
		const occurrence = (occurrences.get(identity) ?? 0) + 1;
		occurrences.set(identity, occurrence);
		return {
			...purchase,
			externalId: `credit-card:v1:${createHash("sha256").update(`${identity}|${occurrence}`).digest("hex")}`,
		};
	});
}
