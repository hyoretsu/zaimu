import type { Transaction } from "./api";

export function getTransactionTitle({
	creditCardName,
	paymentCreditCardId,
	description,
	storeName,
	source,
	type,
}: Pick<
	Transaction,
	| "creditCardName"
	| "creditCardStatementDate"
	| "paymentCreditCardId"
	| "description"
	| "storeName"
	| "source"
	| "type"
>) {
	const trimmedDescription = description?.trim();
	const trimmedStoreName = storeName?.trim();
	if (trimmedDescription && trimmedDescription !== "Compra") return trimmedDescription;
	if (trimmedStoreName) return trimmedStoreName;
	if (trimmedDescription) return trimmedDescription;
	if (paymentCreditCardId) {
		const cardName = creditCardName?.trim() || "Cartão de crédito";
		return `Pagamento do cartão - ${cardName}`;
	}
	if (source === "CREDIT_CARD") return "Compra";
	if (type === "TRANSFER") return "Transferência";
	return "Transação";
}
