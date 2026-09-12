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
		const identity = [
			"credit-card-import-v1",
			creditCardId,
			purchase.purchaseDate,
			normalize(purchase.description),
			purchase.installmentAmount.toFixed(2),
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
