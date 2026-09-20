import { TransactionListItem } from "@/components/transactions";
import type { Transaction } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

export function TransferSuggestionTransactionSummary({ transaction }: { transaction: Transaction }) {
	const time = formatLocalTime(transaction.time);
	return (
		<TransactionListItem
			className="rounded-xl border"
			metadataPrefix={
				<span className="text-muted-foreground text-xs">
					{formatLocalDate(transaction.date)}
					{time ? ` · ${time}` : ""}
				</span>
			}
			transaction={transaction}
		/>
	);
}
