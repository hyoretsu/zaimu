import { LuCircleDollarSign } from "react-icons/lu";
import type { Transaction } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

export function CreditCardPaymentRow({ payment }: { payment: Transaction }) {
	const currencyCode = payment.destinationCurrency ?? payment.bookingCurrency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	return (
		<div className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				<p className="flex items-center gap-2 truncate font-medium">
					<LuCircleDollarSign className="shrink-0 text-success-600" />
					{payment.description || "Pagamento da fatura"}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{formatLocalDate(payment.date)}
					{formatLocalTime(payment.time) ? ` · ${formatLocalTime(payment.time)}` : ""}
				</p>
			</div>
			<strong className="amount-positive">
				{currency.format(payment.destinationAmount ?? -payment.amount)}
			</strong>
		</div>
	);
}
