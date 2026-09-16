import { LuPencil, LuRefreshCw, LuTrash2, LuUndo2 } from "react-icons/lu";
import { TransactionBadges } from "@/components/transactions/TransactionListItem/TransactionBadges";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { CreditPurchase } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditPurchaseRow({
	disabled,
	refinanceDisabled,
	refundDisabled,
	onDelete,
	onEdit,
	onRefinance,
	onRefund,
	purchase,
}: {
	disabled: boolean;
	refinanceDisabled: boolean;
	refundDisabled: boolean;
	onDelete: () => void | Promise<void>;
	onEdit: () => void;
	onRefinance: () => void;
	onRefund: () => void;
	purchase: CreditPurchase;
}) {
	const fallbackTag = purchase.categoryName
		? {
				color: purchase.categoryColor,
				id: purchase.categoryId || `category-${purchase.categoryName}`,
				name: purchase.categoryName,
			}
		: undefined;
	const tags = purchase.tags?.length ? purchase.tags : fallbackTag ? [fallbackTag] : undefined;
	const debtPersonName = purchase.debtSplit?.participants
		.map(item => `${item.debtPersonName}: ${currency.format(item.amount)}`)
		.join(" · ");

	return (
		<div className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				<p className="truncate font-medium">{purchase.description || purchase.storeName || "Compra"}</p>
				<p className="truncate text-muted-foreground text-xs">
					{formatLocalDate(purchase.purchaseDate)}
					{formatLocalTime(purchase.time) ? ` · ${formatLocalTime(purchase.time)}` : ""}
					{purchase.isRefund ? " · Reembolso" : purchase.hasRefund ? " · Reembolsada" : ""}
					{purchase.isForecast ? " · Previsão" : ""}
					{purchase.installments > 1 ? ` · ${purchase.currentInstallment}/${purchase.installments}` : ""}
					{purchase.isSettled ? " · Quitada por reparcelamento" : ""}
				</p>
				{purchase.feeAmount && purchase.feeDescription ? (
					<p className="mt-1 text-muted-foreground text-xs">
						Inclui {purchase.feeDescription}: {currency.format(purchase.feeAmount)}
					</p>
				) : null}
				{purchase.storeName || debtPersonName || tags?.length ? (
					<div className="mt-2">
						<TransactionBadges
							accounts={[]}
							debtPersonName={debtPersonName}
							storeName={purchase.storeName}
							tags={tags}
						/>
					</div>
				) : null}
			</div>
			<div className="grid min-w-0 justify-items-end gap-2">
				<strong className={purchase.isRefund ? "text-emerald-600" : undefined}>
					{currency.format(purchase.installmentAmount)}
				</strong>
				<div className="flex flex-wrap justify-end gap-2">
					{!purchase.isRefund ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label={`Reembolsar ${purchase.description}`}
									className="cursor-pointer"
									disabled={refundDisabled}
									onClick={onRefund}
									size="icon-sm"
									variant="outline"
								>
									<LuUndo2 />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{purchase.hasRefund ? "Editar reembolso" : "Reembolsar"}</TooltipContent>
						</Tooltip>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label={`Editar ${purchase.description}`}
								className="cursor-pointer"
								disabled={disabled}
								onClick={onEdit}
								size="icon-sm"
								variant="outline"
							>
								<LuPencil />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Editar</TooltipContent>
					</Tooltip>
					{purchase.installments > 1 && !purchase.isSettled ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label={`Reparcelar ${purchase.description}`}
									className="cursor-pointer"
									disabled={refinanceDisabled}
									onClick={onRefinance}
									size="icon-sm"
									variant="outline"
								>
									<LuRefreshCw />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Reparcelar</TooltipContent>
						</Tooltip>
					) : null}
					{purchase.installments === 1 ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<ConfirmActionButton
										aria-label={`Excluir ${purchase.description}`}
										className="cursor-pointer"
										confirmation="Excluir esta compra permanentemente?"
										disabled={disabled}
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
					) : null}
				</div>
			</div>
		</div>
	);
}
