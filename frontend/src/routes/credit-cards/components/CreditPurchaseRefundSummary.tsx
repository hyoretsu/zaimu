import { LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import type { CreditPurchase } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditPurchaseRefundSummary({
	refund,
	onEdit,
	disabled,
}: {
	refund: NonNullable<CreditPurchase["refunds"]>[number];
	onEdit: () => void;
	disabled: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
			<div className="text-muted-foreground text-xs">
				<p>
					Reembolso em {formatLocalDate(refund.date)}: {currency.format(refund.amount)}
				</p>
				<p>
					Crédito {currency.format(refund.creditAmount)}
					{refund.canceledAmount > 0
						? ` - parcelas canceladas ${currency.format(refund.canceledAmount)}`
						: ""}
				</p>
			</div>
			<Button
				aria-label={`Editar reembolso de ${currency.format(refund.amount)}`}
				disabled={disabled}
				onClick={onEdit}
				size="icon-sm"
				variant="outline"
			>
				<LuPencil />
			</Button>
		</div>
	);
}
