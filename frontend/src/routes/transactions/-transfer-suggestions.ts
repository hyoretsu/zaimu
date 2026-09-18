import type { Transaction } from "@/lib/api";

function getTransactionAccountId(transaction: Transaction) {
	return transaction.type === "INCOME"
		? transaction.destinationFinancialAccountId
		: transaction.originFinancialAccountId;
}

export function getTransferSuggestions(transactions: Transaction[]) {
	return transactions.flatMap((transaction, index) =>
		transactions.slice(index + 1).flatMap(counterpart => {
			const transactionAccountId = getTransactionAccountId(transaction);
			const counterpartAccountId = getTransactionAccountId(counterpart);
			const hasOppositeTypes =
				(transaction.type === "EXPENSE" && counterpart.type === "INCOME") ||
				(transaction.type === "INCOME" && counterpart.type === "EXPENSE");

			return transaction.date.slice(0, 10) === counterpart.date.slice(0, 10) &&
				Number(transaction.amount) === Number(counterpart.amount) &&
				hasOppositeTypes &&
				transactionAccountId &&
				counterpartAccountId &&
				transactionAccountId !== counterpartAccountId
				? [{ counterpart, transaction }]
				: [];
		}),
	);
}
