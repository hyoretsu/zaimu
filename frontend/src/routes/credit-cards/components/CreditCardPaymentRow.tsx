import { formatAsset } from "@zaimu/finance/asset-amount";
import { LuTrash2 } from "react-icons/lu";
import { ItemActions } from "@/components/transactions/TransactionListItem/ItemActions";
import type { Transaction } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

export function CreditCardPaymentRow({
	deleteDisabled,
	onDelete,
	payment,
}: {
	deleteDisabled?: boolean;
	onDelete: () => Promise<void> | void;
	payment: Transaction;
}) {
	const currencyCode = payment.destinationCurrency ?? payment.bookingCurrency ?? "BRL";
	const description = payment.description || "Pagamento da fatura";
	return (
		<div className="bg-card grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
			<div className="min-w-0">
				<p className="truncate font-medium">{description}</p>
				<p className="text-muted-foreground truncate text-xs">
					{formatLocalDate(payment.date)}
					{formatLocalTime(payment.time) ? ` · ${formatLocalTime(payment.time)}` : ""}
				</p>
			</div>
			<div className="flex min-w-0 flex-col items-end justify-between gap-2">
				<strong className="amount-positive">
					{formatAsset(
						payment.destinationAmount ?? String(payment.amount).replace(/^-/, ""),
						currencyCode,
					)}
				</strong>
				<div className="flex flex-wrap justify-end gap-2">
					<ItemActions
						actions={[
							{
								ariaLabel: `Excluir ${description}`,
								color: "destructive",
								confirmation: "Excluir este pagamento permanentemente?",
								confirmIcon: <LuTrash2 />,
								disabled: deleteDisabled,
								icon: <LuTrash2 />,
								onConfirm: onDelete,
								text: "Excluir",
							},
						]}
						forceCompact
					/>
				</div>
			</div>
		</div>
	);
}
