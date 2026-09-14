import type { Transaction } from "./api";

export function getTransactionTitle({
	description,
	storeName,
	source,
	type,
}: Pick<Transaction, "description" | "storeName" | "source" | "type">) {
	const trimmedDescription = description?.trim();
	const trimmedStoreName = storeName?.trim();
	if (trimmedDescription && trimmedDescription !== "Compra") return trimmedDescription;
	if (trimmedStoreName) return trimmedStoreName;
	if (trimmedDescription) return trimmedDescription;
	if (source === "CREDIT_CARD") return "Compra";
	if (type === "TRANSFER") return "Transferência";
	return "Transação";
}
