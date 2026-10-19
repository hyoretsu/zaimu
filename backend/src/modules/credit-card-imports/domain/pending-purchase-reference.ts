import { importedAnticipation } from "@zaimu/finance/imported-anticipation";

// Stable batch dependency, stored alongside the existing import description metadata.
const reference = /^\[import-source:([a-zA-Z0-9-]+)\] /u;
export const pendingPurchaseId = (description: string) => description.match(reference)?.[1] ?? null;
export const withoutPendingPurchase = (description: string) => description.replace(reference, "");
export const withPendingPurchase = (description: string, id: string) =>
	`[import-source:${id}] ${withoutPendingPurchase(description)}`;

/** Only plain purchases in this batch can be dependencies; never chains or cycles. */
export function includePendingPurchaseSources<
	T extends {
		id: string;
		description: string;
		installmentAmount: number | string;
		isStatementCharge: boolean;
	},
>(selected: T[], batch: T[], canApproveSource?: (source: T) => boolean) {
	const result = new Map(selected.map(item => [item.id, item]));
	for (const item of selected) {
		const id = pendingPurchaseId(item.description);
		if (!id) continue;
		const source = batch.find(candidate => candidate.id === id);
		if (
			!source ||
			source.id === item.id ||
			Number(source.installmentAmount) <= 0 ||
			source.isStatementCharge ||
			importedAnticipation(source.description) ||
			pendingPurchaseId(source.description) ||
			source.description.startsWith("FIN ")
		)
			throw new Error("Compra original pendente não encontrada nesta importação");
		if (canApproveSource && !canApproveSource(source)) {
			result.delete(item.id);
			continue;
		}
		result.set(source.id, source);
	}
	return [...result.values()].sort(
		(a, b) =>
			Number(Boolean(pendingPurchaseId(a.description))) - Number(Boolean(pendingPurchaseId(b.description))),
	);
}
