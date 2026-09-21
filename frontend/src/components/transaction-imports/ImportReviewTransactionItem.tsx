import {
	LuCheck,
	LuChevronDown,
	LuChevronUp,
	LuCircleAlert,
	LuLandmark,
	LuPencil,
	LuShieldOff,
} from "react-icons/lu";
import { TransactionListItem } from "@/components/transactions";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { Transaction, TransactionImportItem } from "@/lib/api";
import { formatLocalTime } from "@/lib/date";
import { getTransactionTitle } from "@/lib/transaction-title";
import { TransferSuggestionActions } from "./TransferSuggestionActions";

function formatCurrency(value: number) {
	return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

export function ImportReviewTransactionItem({
	collapsed,
	disabled,
	item,
	accountNames,
	onApprove,
	onCollapsedChange,
	onEdit,
	onIgnoreDuplicate,
	onViewTransferSuggestion,
	onResolveDuplicate,
	transaction,
}: {
	accountNames: Map<string, string>;
	collapsed: boolean;
	disabled: boolean;
	item: TransactionImportItem;
	onApprove: () => void;
	onCollapsedChange: (collapsed: boolean) => void;
	onEdit: () => void;
	onIgnoreDuplicate: () => void;
	onViewTransferSuggestion: (suggestion: TransactionImportItem["transferSuggestions"][number]) => void;
	onResolveDuplicate: () => void;
	transaction: Transaction;
}) {
	const amountPrefix = transaction.type === "INCOME" ? "+" : transaction.type === "EXPENSE" ? "−" : "";
	const amountColor = transaction.type === "INCOME" ? "text-emerald-600" : "text-rose-600";
	const expandLabel = `Expandir ${getTransactionTitle(transaction)}`;
	const collapseLabel = `Minimizar ${getTransactionTitle(transaction)}`;
	if (collapsed) {
		return (
			<div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
				<div
					className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted ${amountColor}`}
				>
					<LuLandmark aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm">{getTransactionTitle(transaction)}</p>
					<span className="text-muted-foreground text-xs">Pendente de aprovação</span>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<p className={`font-semibold text-sm ${amountColor}`}>
						{amountPrefix}
						{formatCurrency(Number(transaction.amount))}
					</p>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-expanded={false}
								aria-label={expandLabel}
								className="cursor-pointer"
								onClick={() => onCollapsedChange(false)}
								size="icon-xs"
								variant="outline"
							>
								<LuChevronDown aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{expandLabel}</TooltipContent>
					</Tooltip>
				</div>
			</div>
		);
	}

	return (
		<TransactionListItem
			actionItems={[
				...(item.duplicates.length
					? [
							{
								disabled,
								icon: <LuCircleAlert />,
								onClick: onResolveDuplicate,
								text: "Resolver duplicata",
							},
						]
					: []),
				...(item.duplicateReason
					? [
							{
								disabled,
								icon: <LuShieldOff />,
								onClick: onIgnoreDuplicate,
								text: "Ignorar alerta",
							},
						]
					: []),
				...(!item.duplicateReason
					? [
							{
								color: "default" as const,
								disabled,
								icon: <LuCheck />,
								onClick: onApprove,
								text: "Aprovar",
							},
						]
					: []),
				{ disabled, icon: <LuPencil />, onClick: onEdit, text: "Editar" },
				{
					ariaLabel: collapseLabel,
					disabled,
					icon: <LuChevronUp />,
					onClick: () => onCollapsedChange(true),
					text: "Minimizar",
				},
			]}
			forceCompactActions
			metadataPrefix={
				<div className="space-y-2">
					<TransferSuggestionActions
						accountNames={accountNames}
						disabled={disabled}
						onView={onViewTransferSuggestion}
						suggestions={item.transferSuggestions}
					/>
					<div className="flex flex-wrap items-center gap-1.5">
						{formatLocalTime(item.time) ? (
							<span className="text-muted-foreground text-xs">{formatLocalTime(item.time)}</span>
						) : null}
						{item.duplicateReason ? (
							<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs">
								<LuCircleAlert /> Possível duplicata
							</span>
						) : null}
						{item.isReconciled ? (
							<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs">
								<LuCheck /> Conciliada
							</span>
						) : null}
					</div>
				</div>
			}
			transaction={transaction}
		/>
	);
}
