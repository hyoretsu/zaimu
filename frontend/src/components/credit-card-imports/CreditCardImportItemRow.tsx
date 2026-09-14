import { LuCheck, LuCircleAlert, LuPencil } from "react-icons/lu";
import { TransactionListItem } from "@/components/transactions";
import type { CreditCardImportItem, Transaction } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

function toTransaction(
	item: CreditCardImportItem,
	creditCardId: string,
	creditCardName: string,
): Transaction {
	return {
		amount: item.totalAmount,
		createdAt: item.createdAt,
		creditCardId,
		date: item.purchaseDate,
		debtSplit: item.debtSplit,
		description: item.description,
		id: item.id,
		installmentAmount: item.installmentAmount,
		installments: item.installments,
		refund: undefined,
		source: "CREDIT_CARD",
		sourceName: creditCardName,
		storeName: item.storeName,
		tagIds: item.tagIds,
		tags: item.tags,
		time: item.time,
		type: "EXPENSE",
	};
}

export function CreditCardImportItemRow({
	creditCardId,
	creditCardName,
	disabled,
	item,
	onApprove,
	onEdit,
	onReconcile,
}: {
	creditCardId: string;
	creditCardName: string;
	disabled: boolean;
	item: CreditCardImportItem;
	onApprove: () => void;
	onEdit: () => void;
	onReconcile: () => void;
}) {
	const transaction = toTransaction(item, creditCardId, creditCardName);

	return (
		<TransactionListItem
			actionItems={[
				...(item.duplicates.length
					? [
							{
								disabled,
								icon: <LuCircleAlert />,
								onClick: onReconcile,
								text: "Resolver duplicata",
							},
						]
					: []),
				{
					disabled: disabled || item.duplicates.length > 0,
					icon: <LuCheck />,
					onClick: onApprove,
					text: "Aprovar",
				},
				{ disabled, icon: <LuPencil />, onClick: onEdit, text: "Editar" },
			]}
			forceCompactActions
			metadataPrefix={
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground text-xs">{formatLocalDate(item.purchaseDate)}</span>
					{item.duplicates.length ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs">
							<LuCircleAlert /> Possível duplicata
						</span>
					) : item.reconciledCreditPurchaseId ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs">
							<LuCheck /> Conciliada
						</span>
					) : (
						<span className="text-muted-foreground text-xs">Pendente de aprovação</span>
					)}
				</div>
			}
			transaction={transaction}
		/>
	);
}
