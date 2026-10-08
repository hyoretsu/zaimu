import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { LuCheck, LuCircleAlert, LuPencil } from "react-icons/lu";
import { ImportItemDateTime, TransactionListItem } from "@/components/transactions";
import { AppBadge } from "@/components/ui/AppBadge";
import type { CreditCardImportItem, Transaction } from "@/lib/api";
import {
	cleanFinancedDescription,
	getFinancedOperation,
	hasFinancingSource,
	hasFinancingTarget,
} from "@/lib/financing-source-reference";

function toTransaction(
	item: CreditCardImportItem,
	creditCardId: string,
	creditCardName: string,
	currencyCode: string,
): Transaction {
	const financedOperation = getFinancedOperation(item.description);
	return {
		amount: Math.abs(item.totalAmount),
		createdAt: item.createdAt,
		creditCardId,
		date: item.purchaseDate,
		debtSplit: item.isStatementCharge ? null : item.debtSplit,
		description:
			financedOperation?.merchant ?? withoutImportedAnticipation(cleanFinancedDescription(item.description)),
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
		type: item.installmentAmount < 0 ? "REFUND" : "EXPENSE",
	};
}

export function CreditCardImportItemRow({
	currencyCode,
	creditCardId,
	creditCardName,
	disabled,
	item,
	onApprove,
	onEdit,
	onReconcile,
}: {
	currencyCode: string;
	creditCardId: string;
	creditCardName: string;
	disabled: boolean;
	item: CreditCardImportItem;
	onApprove: () => void;
	onEdit: () => void;
	onReconcile: () => void;
}) {
	const transaction = toTransaction(item, creditCardId, creditCardName, currencyCode);
	const financedOperation = getFinancedOperation(item.description);
	const anticipated = importedAnticipation(item.description);
	const anticipatedAmount = anticipated?.reduce((sum, installment) => sum + installment.amountCents, 0) ?? 0;
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });

	return (
		<TransactionListItem
			actionItems={[
				...(item.duplicates.length
					? [
							{
								disabled,
								icon: <LuCircleAlert />,
								onClick: onReconcile,
								text: anticipated ? "Vincular compra original" : "Resolver duplicata",
							},
						]
					: []),
				{
					disabled:
						disabled ||
						(item.installmentAmount >= 0 &&
							(item.duplicates.length > 0 || Boolean(anticipated && !item.reconciledCreditPurchaseId))),
					icon: <LuCheck />,
					onClick: onApprove,
					text: item.installmentAmount < 0 ? "Revisar reembolso" : "Aprovar",
				},
				...(item.installmentAmount < 0
					? []
					: [{ disabled, icon: <LuPencil />, onClick: onEdit, text: "Editar" }]),
			]}
			amount={
				anticipated ? (
					<span className="whitespace-nowrap font-semibold text-foreground text-sm">
						{currency.format(anticipatedAmount / 100)} nesta fatura
					</span>
				) : undefined
			}
			forceCompactActions
			metadataPrefix={
				<div className="flex flex-wrap items-center gap-1.5">
					<ImportItemDateTime
						date={anticipated && !item.reconciledCreditPurchaseId ? undefined : item.purchaseDate}
						originalPurchase={!anticipated || Boolean(item.reconciledCreditPurchaseId)}
						time={item.time}
					/>
					{item.isStatementCharge && <AppBadge variant="outline">Encargo da fatura</AppBadge>}
					{anticipated && <AppBadge variant="outline">Antecipação de {anticipated.length} parcelas</AppBadge>}
					{anticipated && !item.reconciledCreditPurchaseId && (
						<AppBadge variant="outline">
							{item.duplicates.length ? "Vincule à compra original" : "Importe a compra original"}
						</AppBadge>
					)}
					{financedOperation ? (
						<AppBadge
							className="h-auto min-h-7 whitespace-normal break-words py-1 leading-4"
							variant="outline"
						>
							Crédito parcelado · IOF R$ {financedOperation.iof} incluído
						</AppBadge>
					) : null}
					{hasFinancingSource(item.description) ? (
						<AppBadge variant="outline">Vinculada à compra original</AppBadge>
					) : null}
					{hasFinancingTarget(item.description) ? (
						<AppBadge variant="outline">Será compensada pelo crédito parcelado</AppBadge>
					) : null}
					{item.duplicates.length ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs">
							<LuCircleAlert /> {anticipated ? "Escolha a compra original" : "Possível duplicata"}
						</span>
					) : item.reconciledCreditPurchaseId ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 text-xs">
							<LuCheck /> Conciliada
						</span>
					) : null}
				</div>
			}
			title={
				anticipated ? (
					<p className="min-w-0 flex-1 truncate font-semibold leading-6">
						Antecipação - {withoutImportedAnticipation(cleanFinancedDescription(item.description))}
					</p>
				) : undefined
			}
			transaction={transaction}
		/>
	);
}
