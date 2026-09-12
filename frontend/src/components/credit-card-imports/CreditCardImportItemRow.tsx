import { LuCheck, LuPencil } from "react-icons/lu";
import { TransactionListItem } from "@/components/transactions";
import { Checkbox } from "@/components/ui/Checkbox";
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
		currentInstallment: item.currentInstallment,
		date: item.purchaseDate,
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
	onSelectedChange,
}: {
	creditCardId: string;
	creditCardName: string;
	disabled: boolean;
	item: CreditCardImportItem;
	onApprove: () => void;
	onEdit: () => void;
	onSelectedChange: (selected: boolean) => void;
}) {
	const transaction = toTransaction(item, creditCardId, creditCardName);

	return (
		<TransactionListItem
			actionItems={[
				{ disabled, icon: <LuCheck />, onClick: onApprove, text: "Aprovar" },
				{ disabled, icon: <LuPencil />, onClick: onEdit, text: "Editar" },
			]}
			forceCompactActions
			icon={
				<div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
					<Checkbox
						aria-label={`Selecionar ${item.description}`}
						checked={item.isSelected}
						disabled={disabled}
						onCheckedChange={checked => onSelectedChange(checked === true)}
					/>
				</div>
			}
			metadataPrefix={
				<span className="text-muted-foreground text-xs">
					{formatLocalDate(item.purchaseDate)} · Pendente de aprovação
				</span>
			}
			transaction={transaction}
		/>
	);
}
