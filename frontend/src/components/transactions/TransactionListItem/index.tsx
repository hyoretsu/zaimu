import type { ReactNode } from "react";
import { LuDollarSign, LuLandmark, LuPencil, LuTrash2 } from "react-icons/lu";
import { OriginalMoneyDetails } from "@/components/currency";
import { AssociateRecurrenceButton } from "@/components/recurrences";
import { ListItemLayout } from "@/components/ui/ListItemLayout";
import type { Transaction } from "@/lib/api";
import { formatDebtSplitBadge } from "@/lib/debt-split";
import { createCurrencyFormatter } from "@/lib/format-currency";
import { getTransactionTitle } from "@/lib/transaction-title";
import { InstallmentPurchaseDetails } from "./InstallmentPurchaseDetails";
import { type ItemAction, ItemActions } from "./ItemActions";
import { type TransactionBadgeAccount, TransactionBadges } from "./TransactionBadges";

export function TransactionListItem({
	additionalActionItems,
	actionItems,
	amount,
	className,
	forceCompactActions = false,
	deleting = false,
	icon,
	badgesLeading,
	metadataPrefix,
	onDelete,
	onEdit,
	perspectiveAccountId,
	showAccountBadge = true,
	title,
	transaction,
}: {
	additionalActionItems?: ItemAction[];
	actionItems?: ItemAction[];
	amount?: ReactNode;
	className?: string;
	deleting?: boolean;
	forceCompactActions?: boolean;
	icon?: ReactNode;
	badgesLeading?: ReactNode;
	metadataPrefix?: ReactNode;
	onDelete?: () => void;
	onEdit?: () => void;
	perspectiveAccountId?: string;
	showAccountBadge?: boolean;
	title?: ReactNode;
	transaction: Transaction;
}) {
	const currencyCode = transaction.bookingCurrency ?? "BRL";
	const formatCurrency = (value: number) => createCurrencyFormatter(currencyCode).format(value);
	const isCreditCardPurchase = transaction.source === "CREDIT_CARD";
	const transferDirection =
		transaction.type !== "TRANSFER" || !perspectiveAccountId
			? undefined
			: transaction.destinationFinancialAccountId === perspectiveAccountId
				? "INCOME"
				: transaction.originFinancialAccountId === perspectiveAccountId
					? "EXPENSE"
					: undefined;
	const displayType = transferDirection ?? transaction.type;
	const amountPrefix =
		Number(transaction.amount) === 0
			? ""
			: displayType === "INCOME"
				? "+"
				: displayType === "EXPENSE"
					? "−"
					: "";
	const amountColor = isCreditCardPurchase
		? "text-primary"
		: displayType === "INCOME"
			? "text-emerald-600"
			: displayType === "EXPENSE"
				? "text-rose-600"
				: "text-primary";
	const isCreditCard = transaction.source === "CREDIT_CARD";
	const originName = transaction.originName || transaction.sourceName;
	const destinationName =
		transaction.destinationName || (transaction.type === "INCOME" ? transaction.sourceName : undefined);
	const accounts: TransactionBadgeAccount[] =
		transaction.type === "TRANSFER"
			? [
					{
						id: transaction.originFinancialAccountId || "origin",
						name: originName || "Conta de origem",
						rewardsKind: transaction.originAccountRewardsKind ?? undefined,
						type: transaction.originAccountType ?? undefined,
					},
					{
						id: transaction.destinationFinancialAccountId || "destination",
						name: destinationName || "Conta de destino",
						rewardsKind: transaction.destinationAccountRewardsKind ?? undefined,
						type: transaction.destinationAccountType ?? undefined,
					},
				]
			: [
					{
						id:
							transaction.originFinancialAccountId ||
							transaction.destinationFinancialAccountId ||
							"account",
						name:
							(transaction.type === "INCOME" ? destinationName : originName) ||
							"Conta sem nome",
						rewardsKind:
							(transaction.type === "INCOME"
								? transaction.destinationAccountRewardsKind
								: transaction.originAccountRewardsKind) ?? undefined,
						type: isCreditCard
							? "CREDIT_CARD"
							: ((transaction.type === "INCOME"
									? transaction.destinationAccountType
									: transaction.originAccountType) ?? undefined),
					},
				];
	const tags = transaction.tags;
	const creditCardPayment =
		transaction.source !== "CREDIT_CARD" && transaction.paymentCreditCardId
			? {
					cardId: transaction.paymentCreditCardId,
					cardName: transaction.creditCardName || "Cartão de crédito",
					statementDate: transaction.creditCardStatementDate ?? undefined,
				}
			: undefined;

	const defaultActionItems: ItemAction[] = [
		...(onEdit && !transaction.detachedKind
			? [{ disabled: deleting, icon: <LuPencil />, onClick: onEdit, text: "Editar" }]
			: []),
		...(onDelete
			? [
					{
						color: "destructive" as const,
						confirmation: `Excluir ${isCreditCardPurchase ? "esta compra" : "esta transação"} permanentemente?`,
						confirmIcon: <LuTrash2 />,
						disabled: deleting,
						icon: <LuTrash2 />,
						onConfirm: onDelete,
						text: "Excluir",
					},
				]
			: []),
	];
	const allActionItems = actionItems ?? [...(additionalActionItems ?? []), ...defaultActionItems];
	const showAssociateRecurrence =
		Boolean(onEdit || onDelete) && !transaction.isRefund && !transaction.detachedKind;
	// The recurrence link button is always icon-only, so it counts toward the 3+ actions rule.
	const compactActions =
		forceCompactActions || allActionItems.length + (showAssociateRecurrence ? 1 : 0) >= 3;

	return (
		<ListItemLayout
			actions={
				allActionItems.length ? (
					<div className="flex flex-wrap items-center justify-end gap-2">
						{showAssociateRecurrence && (
							<AssociateRecurrenceButton
								date={transaction.date}
								disabled={deleting}
								target={{
									...transaction,
									id: isCreditCardPurchase
										? (transaction.parentId ?? transaction.id)
										: transaction.id,
									kind: isCreditCardPurchase ? "PURCHASE" : "TRANSACTION",
								}}
							/>
						)}
						<ItemActions actions={allActionItems} forceCompact={compactActions} />
					</div>
				) : undefined
			}
			amount={
				amount ??
				(isCreditCardPurchase && transaction.isRefund ? (
					<p className="font-bold whitespace-nowrap text-emerald-600">
						{Number(transaction.amount) === 0 ? "" : "+"}
						{formatCurrency(Number(transaction.amount))}
					</p>
				) : isCreditCardPurchase && transaction.installments && transaction.installmentAmount ? (
					<InstallmentPurchaseDetails
						currencyCode={currencyCode}
						installmentAmount={Number(transaction.installmentAmount)}
						installments={transaction.installments}
						totalAmount={Number(transaction.amount)}
					/>
				) : (
					<p className={`font-bold whitespace-nowrap ${amountColor}`}>
						{amountPrefix}
						{formatCurrency(Number(transaction.amount))}
					</p>
				))
			}
			className={className}
			icon={
				icon ?? (
					<div
						className={`bg-muted flex size-11 shrink-0 items-center justify-center rounded-2xl ${amountColor}`}
					>
						{isCreditCardPurchase ? (
							<LuDollarSign aria-hidden="true" />
						) : (
							<LuLandmark aria-hidden="true" />
						)}
					</div>
				)
			}
			metadata={
				<div className="min-w-0 space-y-3">
					{metadataPrefix || transaction.detachedKind ? (
						<div>
							{metadataPrefix}
							{transaction.detachedKind && (
								<span className="text-muted-foreground text-xs">
									{transaction.detachedKind === "CARD_PAYMENT"
										? "Pagamento de fatura - histórico separado"
										: "Histórico separado"}
								</span>
							)}
						</div>
					) : null}
					<OriginalMoneyDetails
						bookingCurrency={currencyCode}
						currency={transaction.currency}
						fees={transaction.fees}
						originalAmount={transaction.originalAmount}
					/>
					<TransactionBadges
						accounts={showAccountBadge ? accounts : []}
						creditCardPayment={creditCardPayment}
						debtPersonName={formatDebtSplitBadge(
							transaction.debtSplitSummary ?? transaction.debtSplit,
						)}
						isRecurring={Boolean(transaction.recurrenceId)}
						isSynced={transaction.isSynced ?? Boolean(transaction.externalIds?.length)}
						storeName={transaction.storeName}
						tags={tags}
					/>
				</div>
			}
			title={
				title ?? (
					<p className="min-w-0 flex-1 truncate leading-6 font-semibold">
						{getTransactionTitle(transaction)}
					</p>
				)
			}
		/>
	);
}
