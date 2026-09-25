import type { Transaction } from "./api";
import { formatLocalMonthYear } from "./date";

export function getTransactionTitle({
	creditCardName,
	creditCardStatementDate,
	creditCardStatementId,
	description,
	storeName,
	source,
	type,
}: Pick<
	Transaction,
	| "creditCardName"
	| "creditCardStatementDate"
	| "creditCardStatementId"
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
	if (creditCardStatementId) {
		const cardName = creditCardName?.trim() || "Cartão de crédito";
		const statementName = creditCardStatementDate ? formatLocalMonthYear(creditCardStatementDate) : "Fatura";
		return `Fatura ${cardName} - ${statementName}`;
	}
	if (source === "CREDIT_CARD") return "Compra";
	if (type === "TRANSFER") return "Transferência";
	return "Transação";
}
