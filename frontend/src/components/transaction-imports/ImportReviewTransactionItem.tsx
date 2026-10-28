import { useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronUp,
	LuCircleAlert,
	LuLandmark,
	LuLink,
	LuLoaderCircle,
	LuPencil,
	LuShieldOff,
} from "react-icons/lu";
import { AssociateImportedRecurrenceDialog } from "@/components/recurrences/AssociateImportedRecurrenceDialog";
import { ImportItemDateTime, TransactionListItem } from "@/components/transactions";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { Transaction, TransactionImportItem } from "@/lib/api";
import { getTransactionTitle } from "@/lib/transaction-title";
import { TransferSuggestionActions } from "./TransferSuggestionActions";

export function ImportReviewTransactionItem({
	collapsed,
	disabled,
	importId,
	onAssociated,
	pending = false,
	isIgnoringDuplicate,
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
	importId?: string;
	onAssociated?: () => Promise<unknown>;
	pending?: boolean;
	isIgnoringDuplicate: boolean;
	item: TransactionImportItem;
	onApprove: () => void;
	onCollapsedChange: (collapsed: boolean) => void;
	onEdit: () => void;
	onIgnoreDuplicate: () => void;
	onViewTransferSuggestion: (suggestion: TransactionImportItem["transferSuggestions"][number]) => void;
	onResolveDuplicate: () => void;
	transaction: Transaction;
}) {
	const [associating, setAssociating] = useState(false);
	const formatCurrency = (value: number) =>
		new Intl.NumberFormat("pt-BR", {
			currency: transaction.bookingCurrency ?? "BRL",
			style: "currency",
		}).format(value);
	const amountPrefix =
		Number(transaction.amount) === 0
			? ""
			: transaction.type === "INCOME"
				? "+"
				: transaction.type === "EXPENSE"
					? "−"
					: "";
	const amountColor = transaction.type === "INCOME" ? "text-emerald-600" : "text-rose-600";
	const expandLabel = `Expandir ${getTransactionTitle(transaction)}`;
	const collapseLabel = `Minimizar ${getTransactionTitle(transaction)}`;
	if (collapsed) {
		return (
			<div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
				<div
					className={`bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl ${amountColor}`}
				>
					<LuLandmark aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{getTransactionTitle(transaction)}</p>
					<span aria-live="polite" className="text-muted-foreground text-xs">
						{pending ? "Processando..." : "Pendente de aprovação"}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<p className={`text-sm font-semibold ${amountColor}`}>
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
		<>
			<TransactionListItem
				actionItems={[
					...(importId &&
					!item.duplicateReason &&
					!item.duplicates.length &&
					["INCOME", "EXPENSE", "TRANSFER"].includes(transaction.type)
						? [
								{
									disabled,
									icon: <LuLink />,
									onClick: () => setAssociating(true),
									text: "Aprovar e associar a recorrência",
								},
							]
						: []),
					...(item.duplicates.length
						? [
								{
									disabled: disabled || isIgnoringDuplicate,
									icon: <LuCircleAlert />,
									onClick: onResolveDuplicate,
									text: "Resolver duplicata",
								},
							]
						: []),
					...(item.duplicateReason
						? [
								{
									disabled: disabled || isIgnoringDuplicate,
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
					{
						disabled: disabled || isIgnoringDuplicate,
						icon: pending ? <LuLoaderCircle className="animate-spin" /> : <LuPencil />,
						onClick: onEdit,
						text: pending ? "Processando..." : "Editar",
					},
					{
						ariaLabel: collapseLabel,
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
							disabled={disabled || isIgnoringDuplicate}
							onView={onViewTransferSuggestion}
							suggestions={item.transferSuggestions}
						/>
						<div className="flex flex-wrap items-center gap-1.5">
							<ImportItemDateTime time={item.time} />
							{item.duplicateReason ? (
								<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
									<LuCircleAlert /> Possível duplicata
								</span>
							) : null}
							{item.isReconciled ? (
								<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">
									<LuCheck /> Conciliada
								</span>
							) : null}
						</div>
					</div>
				}
				transaction={transaction}
			/>
			{associating && importId && (
				<AssociateImportedRecurrenceDialog
					date={transaction.date}
					importId={importId}
					onAssociated={onAssociated}
					onOpenChange={setAssociating}
					target={{ ...transaction, id: item.id, kind: "TRANSACTION" }}
				/>
			)}
		</>
	);
}
