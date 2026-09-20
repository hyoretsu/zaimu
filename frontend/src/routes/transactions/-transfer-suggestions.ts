import type { Transaction } from "@/lib/api";

const timePattern = /^(?<hours>[01]\d|2[0-3]):(?<minutes>[0-5]\d)(?::(?<seconds>[0-5]\d))?$/;

function timeInSeconds(value: string | null | undefined) {
	const match = value?.match(timePattern);
	if (!match?.groups) return null;
	return (
		Number(match.groups.hours) * 3_600 + Number(match.groups.minutes) * 60 + Number(match.groups.seconds ?? 0)
	);
}

function areTimesWithinOneMinute(left: Transaction, right: Transaction) {
	const leftTime = timeInSeconds(left.time);
	const rightTime = timeInSeconds(right.time);
	return leftTime !== null && rightTime !== null && Math.abs(leftTime - rightTime) <= 60;
}

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
				areTimesWithinOneMinute(transaction, counterpart) &&
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
