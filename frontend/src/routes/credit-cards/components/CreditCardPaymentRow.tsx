import { formatAsset } from "@zaimu/finance/asset-amount";
import { LuCircleDollarSign, LuTrash2 } from "react-icons/lu";
import { ItemActions } from "@/components/transactions/TransactionListItem/ItemActions";
import { ListItemLayout } from "@/components/ui/ListItemLayout";
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
	const time = formatLocalTime(payment.time);
	return (
		<ListItemLayout
			actions={
				<ItemActions
					actions={[
						{
							ariaLabel: `Excluir ${payment.description || "pagamento da fatura"}`,
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
			}
			amount={
				<p className="amount-positive font-bold whitespace-nowrap">
					{formatAsset(
						payment.destinationAmount ?? String(payment.amount).replace(/^-/, ""),
						currencyCode,
					)}
				</p>
			}
			className="bg-card rounded-xl border"
			icon={
				<div className="bg-muted text-success-600 flex size-11 shrink-0 items-center justify-center rounded-2xl">
					<LuCircleDollarSign aria-hidden="true" />
				</div>
			}
			metadata={
				<span className="text-muted-foreground text-xs">
					{formatLocalDate(payment.date)}
					{time ? ` · ${time}` : ""}
				</span>
			}
			title={
				<p className="min-w-0 flex-1 truncate leading-6 font-semibold">
					{payment.description || "Pagamento da fatura"}
				</p>
			}
		/>
	);
}
