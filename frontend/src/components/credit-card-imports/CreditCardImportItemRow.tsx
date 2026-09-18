import { LuCheck, LuCircleAlert, LuPencil } from "react-icons/lu";
import { TransactionListItem } from "@/components/transactions";
import type { CreditCardImportItem, Transaction } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";
import { cleanFinancedDescription, hasFinancingSource } from "@/lib/financing-source-reference";

function toTransaction(
	item: CreditCardImportItem,
	creditCardId: string,
	creditCardName: string,
): Transaction {
	const financedOperation = cleanFinancedDescription(item.description).match(
		/^(FIN .+?) · IOF R\$ ([\d.]+,\d{2})$/u,
	);
	return {
		amount: Math.abs(item.totalAmount),
		createdAt: item.createdAt,
		creditCardId,
		date: item.purchaseDate,
		debtSplit: item.debtSplit,
		description: financedOperation?.[1]?.replace(/^FIN /u, "") ?? cleanFinancedDescription(item.description),
		id: item.id,
		installmentAmount: item.installmentAmount,
		installments: item.installments,
		isRefund: item.installmentAmount < 0,
		refund: undefined,
		source: "CREDIT_CARD",
		sourceName: creditCardName,
		storeName: item.storeName,
		tagIds: item.tagIds,
		tags: item.tags,
		time: item.time,
		type: item.installmentAmount < 0 ? "INCOME" : "EXPENSE",
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
	const financedOperation = cleanFinancedDescription(item.description).match(
		/^(FIN .+?) · IOF R\$ ([\d.]+,\d{2})$/u,
	);

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
				...(item.installmentAmount < 0
					? []
					: [{ disabled, icon: <LuPencil />, onClick: onEdit, text: "Editar" }]),
			]}
			forceCompactActions
			metadataPrefix={
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground text-xs">{formatLocalDate(item.purchaseDate)}</span>
					{financedOperation ? (
						<span className="rounded-full border bg-muted px-2 py-0.5 text-muted-foreground text-xs">
							Crédito parcelado · IOF R$ {financedOperation[2]} incluído
						</span>
					) : null}
					{hasFinancingSource(item.description) ? (
						<span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs">
							Vinculada à compra original
						</span>
					) : null}
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
