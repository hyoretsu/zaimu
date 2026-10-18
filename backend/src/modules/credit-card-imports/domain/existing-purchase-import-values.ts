import { importedAnticipation, withImportedAnticipation } from "@zaimu/finance/imported-anticipation";

export function existingPurchaseImportValues(
	description: string,
	original: {
		description: string;
		purchaseDate: Date;
		storeName: string | null;
		time: string | null;
		totalAmount: number | string;
	},
) {
	const anticipated = importedAnticipation(description);
	return {
		description: anticipated
			? withImportedAnticipation(original.description, anticipated)
			: original.description,
		purchaseDate: original.purchaseDate,
		storeName: original.storeName,
		time: original.time,
		totalAmount: String(original.totalAmount),
	};
}
