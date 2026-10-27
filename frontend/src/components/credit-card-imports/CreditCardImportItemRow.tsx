import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuPencil, LuUndo2 } from "react-icons/lu";
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
		amount: Math.abs(item.installmentAmount < 0 ? item.installmentAmount : item.totalAmount),
		bookingCurrency: currencyCode,
		createdAt: item.createdAt,
		creditCardId,
		date: item.purchaseDate,
		debtSplit: item.isStatementCharge ? null : item.debtSplit,
		description:
			financedOperation?.merchant ??
			withoutImportedAnticipation(cleanFinancedDescription(item.description)),
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
	pending = false,
	item,
	onApprove,
	onEdit,
	onReconcile,
	onReviewRefund,
}: {
	currencyCode: string;
	creditCardId: string;
	creditCardName: string;
	disabled: boolean;
	pending?: boolean;
	item: CreditCardImportItem;
	onApprove: () => void;
	onEdit: () => void;
	onReconcile: () => void;
	onReviewRefund: () => void;
}) {
	const transaction = toTransaction(item, creditCardId, creditCardName, currencyCode);
	const financedOperation = getFinancedOperation(item.description);
	const cancellation = item.installmentAmount < 0 ? importedAnticipation(item.description) : null;
	const anticipated = item.installmentAmount > 0 ? importedAnticipation(item.description) : null;
	const requiresOriginal = Boolean(anticipated);
	const anticipatedAmount =
		anticipated?.reduce((sum, installment) => sum + installment.amountCents, 0) ?? 0;
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
				...(item.installmentAmount < 0
					? [{ disabled, icon: <LuPencil />, onClick: onReviewRefund, text: "Revisar reembolso" }]
					: []),
				{
					disabled:
						disabled ||
						(item.installmentAmount < 0
							? !item.refundReview
							: item.duplicates.length > 0 ||
								Boolean(requiresOriginal && !item.reconciledCreditPurchaseId)),
					icon: pending ? <LuLoaderCircle className="animate-spin" /> : <LuCheck />,
					onClick: onApprove,
					text: pending ? "Processando..." : "Aprovar",
				},
				...(item.installmentAmount < 0
					? []
					: [
							{
								disabled,
								icon: pending ? <LuLoaderCircle className="animate-spin" /> : <LuPencil />,
								onClick: onEdit,
								text: "Editar",
							},
						]),
			]}
			amount={
				cancellation ? (
					<span className="text-sm font-semibold whitespace-nowrap text-emerald-600">
						{currency.format(Math.abs(item.installmentAmount))}
					</span>
				) : anticipated ? (
					<span className="text-foreground text-sm font-semibold whitespace-nowrap">
						{currency.format(anticipatedAmount / 100)} nesta fatura
					</span>
				) : undefined
			}
			forceCompactActions
			icon={
				item.installmentAmount < 0 ? (
					<div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-2xl text-emerald-600">
						<LuUndo2 aria-hidden="true" />
					</div>
				) : undefined
			}
			metadataPrefix={
				<div className="flex flex-wrap items-center gap-1.5">
					<ImportItemDateTime
						date={
							requiresOriginal && !item.reconciledCreditPurchaseId
								? undefined
								: item.purchaseDate
						}
						originalPurchase={
							item.installmentAmount >= 0 &&
							(!requiresOriginal || Boolean(item.reconciledCreditPurchaseId))
						}
						time={item.time}
					/>
					{item.installmentAmount < 0 && <AppBadge variant="outline">Reembolso</AppBadge>}
					{item.isStatementCharge && <AppBadge variant="outline">Encargo da fatura</AppBadge>}
					{item.taxes?.map((tax, index) => (
						<AppBadge key={index} variant="outline">
							{tax.name}: {currency.format(tax.amount)}
						</AppBadge>
					))}
					{anticipated && (
						<AppBadge variant="outline">Antecipação de {anticipated.length} parcelas</AppBadge>
					)}
					{requiresOriginal && !item.reconciledCreditPurchaseId && (
						<AppBadge variant="outline">
							{item.duplicates.length
								? "Vincule à compra original"
								: "Importe a compra original"}
						</AppBadge>
					)}
					{financedOperation ? (
						<AppBadge
							className="h-auto min-h-7 py-1 leading-4 break-words whitespace-normal"
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
						<span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
							<LuCircleAlert />{" "}
							{anticipated ? "Escolha a compra original" : "Possível duplicata"}
						</span>
					) : item.reconciledCreditPurchaseId ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">
							<LuCheck /> Conciliada
						</span>
					) : null}
				</div>
			}
			title={
				anticipated ? (
					<p className="min-w-0 flex-1 truncate leading-6 font-semibold">
						Antecipação -{" "}
						{withoutImportedAnticipation(cleanFinancedDescription(item.description))}
					</p>
				) : item.installmentAmount < 0 ? (
					<p className="min-w-0 flex-1 truncate leading-6 font-semibold">
						{withoutImportedAnticipation(item.description).replace(/^Reembolso\s*-\s*/iu, "")}
					</p>
				) : undefined
			}
			transaction={transaction}
		/>
	);
}
