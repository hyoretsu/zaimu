import { formatAsset } from "@zaimu/finance/asset-amount";
import { LuCircleDollarSign } from "react-icons/lu";
import type { Transaction } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

export function CreditCardPaymentRow({ payment }: { payment: Transaction }) {
	const currencyCode = payment.destinationCurrency ?? payment.bookingCurrency ?? "BRL";
	return (
		<div className="bg-card grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				<p className="flex items-center gap-2 truncate font-medium">
					<LuCircleDollarSign className="text-success-600 shrink-0" />
					{payment.description || "Pagamento da fatura"}
				</p>
				<p className="text-muted-foreground truncate text-xs">
					{formatLocalDate(payment.date)}
					{formatLocalTime(payment.time) ? ` · ${formatLocalTime(payment.time)}` : ""}
				</p>
			</div>
			<strong className="amount-positive">
				{formatAsset(
					payment.destinationAmount ?? String(payment.amount).replace(/^-/, ""),
					currencyCode,
				)}
			</strong>
		</div>
	);
}
