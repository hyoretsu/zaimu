import { formatAsset } from "@zaimu/finance/asset-amount";
import { LuCircleDollarSign, LuTrash2 } from "react-icons/lu";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
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
			<div className="grid min-w-0 justify-items-end gap-2">
				<strong className="amount-positive">
					{formatAsset(
						payment.destinationAmount ?? String(payment.amount).replace(/^-/, ""),
						currencyCode,
					)}
				</strong>
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<ConfirmActionButton
								aria-label={`Excluir ${payment.description || "pagamento da fatura"}`}
								className="cursor-pointer"
								confirmation="Excluir este pagamento permanentemente?"
								disabled={deleteDisabled}
								onConfirm={onDelete}
								size="icon-sm"
								variant="destructive"
							>
								<LuTrash2 />
							</ConfirmActionButton>
						</span>
					</TooltipTrigger>
					<TooltipContent>Excluir</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
