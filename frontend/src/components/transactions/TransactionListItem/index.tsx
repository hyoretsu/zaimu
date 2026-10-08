import type { ReactNode } from "react";
import { LuDollarSign, LuLandmark, LuPencil, LuTrash2 } from "react-icons/lu";
import { OriginalMoneyDetails } from "@/components/currency";
import { ListItemLayout } from "@/components/ui/ListItemLayout";
import type { Transaction } from "@/lib/api";
import { formatDebtSplitBadge } from "@/lib/debt-split";
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
	metadataPrefix,
	onDelete,
	onEdit,
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
	metadataPrefix?: ReactNode;
	onDelete?: () => void;
	onEdit?: () => void;
	showAccountBadge?: boolean;
	title?: ReactNode;
	transaction: Transaction;
}) {
	const currencyCode = transaction.bookingCurrency ?? "BRL";
	const formatCurrency = (value: number) =>
		new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" }).format(value);
	const isCreditCardPurchase = transaction.source === "CREDIT_CARD";
	const amountPrefix =
		Number(transaction.amount) === 0
			? ""
			: transaction.type === "INCOME"
				? "+"
				: transaction.type === "EXPENSE"
					? "−"
					: "";
	const amountColor = isCreditCardPurchase
		? "text-primary"
		: transaction.type === "INCOME"
			? "text-emerald-600"
			: transaction.type === "EXPENSE"
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
							transaction.originFinancialAccountId || transaction.destinationFinancialAccountId || "account",
						name: (transaction.type === "INCOME" ? destinationName : originName) || "Conta sem nome",
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
					cardName: transaction.creditCardName || "Cartão de crédito",
					statementDate: transaction.creditCardStatementDate ?? undefined,
				}
			: undefined;

	const defaultActionItems: ItemAction[] = [
		...(onEdit ? [{ disabled: deleting, icon: <LuPencil />, onClick: onEdit, text: "Editar" }] : []),
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

	return (
		<ListItemLayout
			actions={
				allActionItems.length ? (
					<ItemActions actions={allActionItems} forceCompact={forceCompactActions} />
				) : undefined
			}
			amount={
				amount ??
				(isCreditCardPurchase && transaction.isRefund ? (
					<p className="whitespace-nowrap font-bold text-emerald-600">
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
					<p className={`whitespace-nowrap font-bold ${amountColor}`}>
						{amountPrefix}
						{formatCurrency(Number(transaction.amount))}
					</p>
				))
			}
			className={className}
			icon={
				icon ?? (
					<div
						className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted ${amountColor}`}
					>
						{isCreditCardPurchase ? <LuDollarSign aria-hidden="true" /> : <LuLandmark aria-hidden="true" />}
					</div>
				)
			}
			metadata={
				<div className="min-w-0 space-y-3">
					{metadataPrefix ? <div>{metadataPrefix}</div> : null}
					<OriginalMoneyDetails
						currency={transaction.currency}
						fees={transaction.fees}
						originalAmount={transaction.originalAmount}
					/>
					<TransactionBadges
						accounts={showAccountBadge ? accounts : []}
						creditCardPayment={creditCardPayment}
						debtPersonName={formatDebtSplitBadge(
							transaction.debtSplitSummary ?? transaction.debtSplit,
							formatCurrency,
						)}
						isFullySynced={Boolean(transaction.isFullySynced && (transaction.installments ?? 0) > 1)}
						isRecurring={Boolean(transaction.recurrenceId)}
						isSynced={transaction.isSynced ?? Boolean(transaction.externalIds?.length)}
						storeName={transaction.storeName}
						tags={tags}
					/>
				</div>
			}
			title={
				title ?? (
					<p className="min-w-0 flex-1 truncate font-semibold leading-6">
						{getTransactionTitle(transaction)}
					</p>
				)
			}
		/>
	);
}
