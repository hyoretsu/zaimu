import { LuCheck } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import type { LoanPayment } from "@/lib/api";
import { formatCurrency } from "./loan-format";
export function LoanPaymentRow({
	payment,
	disabled,
	pending,
	onPay,
}: {
	payment: LoanPayment;
	disabled: boolean;
	pending: boolean;
	onPay: () => void;
}) {
	const date = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl border p-3">
			<div className="min-w-0">
				<p className="font-medium">
					Parcela {payment.installmentNumber} - {formatCurrency(payment.totalPaid, payment.currency)}
				</p>
				<p className="text-muted-foreground text-xs">
					Vence {date(payment.dueDate)} - juros {formatCurrency(payment.interestPaid, payment.currency)}
				</p>
				{payment.paidDate && (
					<p className="text-xs">
						Paga em {date(payment.paidDate)}
						{payment.isAdvanced ? " (antecipada)" : ""}
						{payment.accountAmount != null &&
							payment.accountCurrency &&
							` - Débito: ${formatCurrency(payment.accountAmount, payment.accountCurrency)}`}
					</p>
				)}
			</div>
			{!payment.paidDate && (
				<Button
					className="shrink-0 cursor-pointer"
					disabled={disabled}
					onClick={onPay}
					size="sm"
					variant="outline"
				>
					<LuCheck />
					{pending ? "Pagando..." : "Pagar"}
				</Button>
			)}
		</div>
	);
}
