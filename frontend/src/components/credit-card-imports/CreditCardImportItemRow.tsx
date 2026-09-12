import { LuCheck, LuGitMerge, LuPencil } from "react-icons/lu";
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
				{
					disabled: disabled || item.duplicates.length > 0,
					icon: <LuCheck />,
					onClick: onApprove,
					text: "Aprovar",
				},
				{
					disabled: disabled || (item.duplicates.length === 0 && !item.reconciledCreditPurchaseId),
					icon: <LuGitMerge />,
					onClick: onReconcile,
					text: item.reconciledCreditPurchaseId ? "Desfazer conciliação" : "Conciliar",
				},
				{ disabled, icon: <LuPencil />, onClick: onEdit, text: "Editar" },
			]}
			forceCompactActions
			metadataPrefix={
				<span className={item.duplicates.length ? "text-warning text-xs" : "text-muted-foreground text-xs"}>
					{formatLocalDate(item.purchaseDate)} ·{" "}
					{item.duplicates.length
						? "Possíveis parcelas existentes"
						: item.reconciledCreditPurchaseId
							? "Parcelas conciliadas"
							: "Pendente de aprovação"}
				</span>
			}
			transaction={transaction}
		/>
	);
}
