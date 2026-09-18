import { withoutFinancingSource } from "./financing-source-reference";

interface FinancingPurchase {
	description: string;
	externalId: string;
	installments: number;
	purchaseDate: string;
}

interface ExistingRoot {
	description: string;
	id: string;
	installments: number;
	purchaseDate: Date | string;
}

const financedName = (description: string) =>
	withoutFinancingSource(description)
		.replace(/ · IOF R\$ [\d.]+,\d{2}$/u, "")
		.trim()
		.toLocaleLowerCase("pt-BR");
const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

export function matchLegacyFinancingRoots(
	purchases: FinancingPurchase[],
	candidates: ExistingRoot[],
	existingRoots: Map<string, string>,
) {
	const claimed = new Set(existingRoots.values());
	for (const purchase of purchases) {
		if (!purchase.description.startsWith("FIN ") || existingRoots.has(purchase.externalId)) continue;
		const matches = candidates.filter(
			candidate =>
				!claimed.has(candidate.id) &&
				candidate.description.startsWith("FIN ") &&
				candidate.installments === purchase.installments &&
				dateKey(candidate.purchaseDate) === purchase.purchaseDate &&
				financedName(candidate.description) === financedName(purchase.description),
		);
		if (matches.length > 1) throw new Error("Parcelamentos antigos ambíguos; concilie antes de importar");
		if (matches.length === 1) {
			const id = matches[0]!.id;
			existingRoots.set(purchase.externalId, id);
			claimed.add(id);
		}
	}
}
