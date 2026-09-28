import { LuPencil, LuRefreshCw, LuTrash2, LuUndo2 } from "react-icons/lu";
import { TransactionBadges } from "@/components/transactions/TransactionListItem/TransactionBadges";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { CreditPurchase } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { formatDebtSplitBadge } from "@/lib/debt-split";
import { CreditPurchaseRefundSummary } from "./CreditPurchaseRefundSummary";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditPurchaseRow({
	deleteDisabled,
	editDisabled,
	refinanceDisabled,
	refundDisabled,
	onDelete,
	onEdit,
	onRefinance,
	onRefund,
	onEditRefund,
	purchase,
}: {
	deleteDisabled: boolean;
	editDisabled: boolean;
	refinanceDisabled: boolean;
	refundDisabled: boolean;
	onDelete: () => void | Promise<void>;
	onEdit: () => void;
	onRefinance: () => void;
	onRefund: () => void;
	onEditRefund: (refund: NonNullable<CreditPurchase["refunds"]>[number]) => void;
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
	const debtPersonName = formatDebtSplitBadge(purchase.debtSplit, amount => currency.format(amount));
	const hasSyncedInstallments = purchase.isFullySynced && purchase.installments > 1;

	return (
		<div className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				<p className="truncate font-medium">
					{purchase.feeDescription === "IOF do parcelamento"
						? purchase.description.replace(/^FIN /u, "")
						: purchase.description || purchase.storeName || "Compra"}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{formatLocalDate(purchase.purchaseDate)}
					{purchase.currentInstallment === 1 && formatLocalTime(purchase.time)
						? ` · ${formatLocalTime(purchase.time)}`
						: ""}
					{purchase.isRefund ? " · Reembolso" : purchase.hasRefund ? " · Reembolsada" : ""}
					{purchase.isForecast ? " · Previsão" : ""}
					{purchase.isStatementCharge ? " · Encargo da fatura" : ""}
					{purchase.installments > 1 ? ` · ${purchase.currentInstallment}/${purchase.installments}` : ""}
					{purchase.isSettled ? " · Compensada pelo crédito do reparcelamento" : ""}
				</p>
				{purchase.feeAmount && purchase.feeDescription ? (
					<p className="mt-1 text-muted-foreground text-xs">
						Inclui {purchase.feeDescription}: {currency.format(purchase.feeAmount)}
					</p>
				) : null}
				{!purchase.isRefund && purchase.refunds?.length ? (
					<div className="mt-2 grid gap-2">
						{purchase.refunds.map(refund => (
							<CreditPurchaseRefundSummary
								disabled={refundDisabled}
								key={refund.id}
								onEdit={() => onEditRefund(refund)}
								refund={refund}
							/>
						))}
					</div>
				) : null}
				{purchase.storeName ||
				debtPersonName ||
				tags?.length ||
				purchase.subscriptionId ||
				purchase.isSynced ||
				hasSyncedInstallments ? (
					<div className="mt-2">
						<TransactionBadges
							accounts={[]}
							debtPersonName={debtPersonName}
							isFullySynced={hasSyncedInstallments}
							isSubscription={Boolean(purchase.subscriptionId)}
							isSynced={purchase.isSynced}
							storeName={purchase.storeName}
							tags={tags}
						/>
					</div>
				) : null}
			</div>
			<div className="grid min-w-0 justify-items-end gap-2">
				<strong
					className={
						purchase.isRefund
							? "text-emerald-600"
							: purchase.isSettled
								? "text-muted-foreground line-through"
								: undefined
					}
				>
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
							<TooltipContent>Registrar reembolso</TooltipContent>
						</Tooltip>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label={`Editar ${purchase.description}`}
								className="cursor-pointer"
								disabled={editDisabled}
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
					) : null}
				</div>
			</div>
		</div>
	);
}
