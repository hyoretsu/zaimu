import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HiArrowDown, HiArrowsRightLeft, HiArrowUp, HiPlus } from "react-icons/hi2";
import { LuFileUp } from "react-icons/lu";
import {
	ImportTransactionsDialog,
	PendingTransactionImportsNotice,
	TransactionImportReviewDialog,
} from "@/components/transaction-imports";
import {
	CreateTransactionDialog,
	EditTransactionDialog,
	TransactionListItem,
} from "@/components/transactions";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { sortTransactionsByMostRecent } from "@/lib/transaction-sort";
import { EditCreditPurchaseDialog } from "@/routes/credit-cards/components/EditCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "@/routes/credit-cards/components/RefundCreditPurchaseDialog";
import { showToast } from "@/stores";
import { groupTransactionsForDisplay } from "./transactions/-transaction-display-groups";
import { transactionToCreditPurchase } from "./transactions/-transaction-to-credit-purchase";
import { HiddenTransactionsToggle } from "./transactions/components";

const typeOptions = [
	{ icon: null, id: "all", label: "Todas" },
	{ icon: HiArrowUp, id: "EXPENSE", label: "Saídas" },
	{ icon: HiArrowDown, id: "INCOME", label: "Entradas" },
	{ icon: HiArrowsRightLeft, id: "TRANSFER", label: "Transferências" },
] as const;

function TransactionsPage() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [editingPurchase, setEditingPurchase] = useState<Transaction | null>(null);
	const [refundingPurchase, setRefundingPurchase] = useState<Transaction | null>(null);
	const [filterType, setFilterType] = useState<string>("all");
	const [expandedHiddenGroups, setExpandedHiddenGroups] = useState<Set<string>>(() => new Set());
	const queryClient = useQueryClient();

	const transactionsQuery = useQuery({
		queryFn: () =>
			dataService.transactions.getAll({
				type: filterType === "all" ? undefined : (filterType as Transaction["type"]),
			}),
		queryKey: ["transactions", filterType],
	});
	const creditCardsQuery = useQuery({
		enabled: editingPurchase !== null,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: ["credit-cards"],
	});

	const groupedTransactions = transactionsQuery.data
		? sortTransactionsByMostRecent(transactionsQuery.data).reduce<Record<string, Transaction[]>>(
				(groups, transaction) => {
					const date = transaction.date.slice(0, 10);
					if (!groups[date]) groups[date] = [];
					groups[date].push(transaction);
					return groups;
				},
				{},
			)
		: undefined;
	const remove = useMutation({
		mutationFn: (id: string) => dataService.transactions.delete(id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["accounts"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-card-statement"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
				queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
				queryClient.invalidateQueries({ queryKey: ["transactions"] }),
				queryClient.invalidateQueries({ queryKey: ["debts"] }),
			]);
			showToast("Transação excluída.", "positive");
		},
	});
	const updatePurchase = useMutation({
		mutationFn: ({
			data,
			transaction,
		}: {
			data: Parameters<typeof dataService.creditCards.updatePurchase>[2];
			transaction: Transaction;
		}) => {
			if (!transaction.creditCardId) throw new Error("Cartão da compra não encontrado");
			return dataService.creditCards.updatePurchase(transaction.creditCardId, transaction.id, data);
		},
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível editar a compra.", "negative"),
		onSuccess: async () => {
			setEditingPurchase(null);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["credit-card-statement"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
				queryClient.invalidateQueries({ queryKey: ["transactions"] }),
				queryClient.invalidateQueries({ queryKey: ["debts"] }),
			]);
			showToast("Compra atualizada.", "positive");
		},
	});
	const removePurchase = useMutation({
		mutationFn: (transaction: Transaction) => {
			if (!transaction.creditCardId) throw new Error("Cartão da compra não encontrado");
			return dataService.creditCards.deletePurchase(transaction.creditCardId, transaction.id);
		},
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível excluir a compra.", "negative"),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["credit-card-statement"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
				queryClient.invalidateQueries({ queryKey: ["debts"] }),
				queryClient.invalidateQueries({ queryKey: ["transactions"] }),
			]);
			showToast("Compra excluída.", "positive");
		},
	});
	const refundPurchase = useMutation({
		mutationFn: ({
			data,
			transaction,
		}: {
			data: { amount?: number; date?: string };
			transaction: Transaction;
		}) => {
			if (!transaction.creditCardId) throw new Error("Cartão da compra não encontrado");
			return transaction.refund
				? dataService.creditCards
						.deletePurchase(transaction.creditCardId, transaction.refund.id)
						.then(() =>
							dataService.creditCards.refundPurchase(transaction.creditCardId!, transaction.id, data),
						)
				: dataService.creditCards.refundPurchase(transaction.creditCardId, transaction.id, data);
		},
		onError: error =>
			showToast(
				error instanceof Error ? error.message : "Não foi possível registrar o reembolso.",
				"negative",
			),
		onSuccess: async () => {
			setRefundingPurchase(null);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["credit-card-statement"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
				queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
				queryClient.invalidateQueries({ queryKey: ["transactions"] }),
			]);
			showToast("Reembolso registrado e faturas recalculadas.", "positive");
		},
	});
	const deleteRefundPurchase = useMutation({
		mutationFn: (transaction: Transaction) => {
			if (!transaction.creditCardId || !transaction.refund) throw new Error("Reembolso não encontrado");
			return dataService.creditCards.deletePurchase(transaction.creditCardId, transaction.refund.id);
		},
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível excluir o reembolso.", "negative"),
		onSuccess: async () => {
			setRefundingPurchase(null);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["credit-card-statement"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
				queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
				queryClient.invalidateQueries({ queryKey: ["transactions"] }),
			]);
			showToast("Reembolso excluído e faturas recalculadas.", "positive");
		},
	});
	const renderTransaction = (transaction: Transaction) => {
		const transactionTime = formatLocalTime(transaction.time);

		return (
			<TransactionListItem
				deleting={
					(transaction.source === "CREDIT_CARD" ? removePurchase.isPending : remove.isPending) &&
					(transaction.source === "CREDIT_CARD" ? removePurchase.variables?.id : remove.variables) ===
						transaction.id
				}
				key={transaction.id}
				metadataPrefix={
					transactionTime ? (
						<span className="text-muted-foreground text-xs">{transactionTime}</span>
					) : undefined
				}
				onDelete={
					transaction.source === "CREDIT_CARD"
						? () => removePurchase.mutate(transaction)
						: () => remove.mutate(transaction.id)
				}
				onEdit={
					transaction.source === "CREDIT_CARD"
						? () => setEditingPurchase(transaction)
						: () => setEditingTransaction(transaction)
				}
				transaction={transaction}
			/>
		);
	};
	const toggleHiddenGroup = (groupId: string) => {
		setExpandedHiddenGroups(current => {
			const next = new Set(current);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	};

	return (
		<PageContainer className="space-y-6">
			<PageHeader
				actions={
					<div className="flex flex-wrap gap-2">
						<Button className="cursor-pointer" onClick={() => setIsModalOpen(true)}>
							<HiPlus /> Adicionar
						</Button>
						<Button className="cursor-pointer" onClick={() => setIsImportOpen(true)} variant="outline">
							<LuFileUp /> Importar
						</Button>
					</div>
				}
				description="Acompanhe entradas, saídas e transferências."
				title="Transações"
			/>
			<PendingTransactionImportsNotice onReview={setReviewingImportId} />

			<div className="grid gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-4 min-[440px]:grid-cols-2">
				{typeOptions.map(option => (
					<Button
						className="w-full cursor-pointer"
						key={option.id}
						onClick={() => setFilterType(option.id)}
						variant={filterType === option.id ? "default" : "outline"}
					>
						{option.icon && <option.icon />}
						{option.label}
					</Button>
				))}
			</div>

			{transactionsQuery.isPending ? (
				<div className="space-y-5">
					{[1, 2, 3].map(item => (
						<div className="space-y-2" key={item}>
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-24 rounded-2xl" />
						</div>
					))}
				</div>
			) : transactionsQuery.isError ? (
				<EmptyState
					description="Não foi possível carregar suas movimentações."
					icon={<HiArrowsRightLeft />}
					title="Falha ao carregar transações"
				/>
			) : !groupedTransactions || Object.keys(groupedTransactions).length === 0 ? (
				<EmptyState
					description="Registre sua primeira movimentação para começar."
					icon={<HiArrowsRightLeft />}
					title="Nenhuma transação"
				/>
			) : (
				<div className="space-y-5">
					{Object.entries(groupedTransactions).map(([date, transactions]) => {
						const displayGroups = groupTransactionsForDisplay(transactions);
						const allTransactionsHidden = displayGroups[0]?.kind === "hidden" && displayGroups.length === 1;
						const dayLabel = `${formatLocalDate(date, { weekday: "long" }).replace(/^./, character => character.toUpperCase())}, ${formatLocalDate(date)}`;

						return (
							<section className="space-y-2" key={date}>
								{allTransactionsHidden ? (
									<HiddenTransactionsToggle
										dateLabel={formatLocalDate(date)}
										expanded={expandedHiddenGroups.has(displayGroups[0].id)}
										hiddenCount={displayGroups[0].transactions.length}
										onClick={() => toggleHiddenGroup(displayGroups[0].id)}
									/>
								) : (
									<>
										<h2 className="font-medium text-muted-foreground text-sm">{dayLabel}</h2>
										{displayGroups.map(group => {
											if (group.kind === "visible") {
												return (
													<div
														className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm"
														key={group.id}
													>
														{group.transactions.map(renderTransaction)}
													</div>
												);
											}

											const isExpanded = expandedHiddenGroups.has(group.id);
											return (
												<div className="space-y-2" key={group.id}>
													<HiddenTransactionsToggle
														expanded={isExpanded}
														hiddenCount={group.transactions.length}
														onClick={() => toggleHiddenGroup(group.id)}
													/>
													{isExpanded ? (
														<div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
															{group.transactions.map(renderTransaction)}
														</div>
													) : null}
												</div>
											);
										})}
									</>
								)}
								{allTransactionsHidden && expandedHiddenGroups.has(displayGroups[0].id) ? (
									<div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
										{displayGroups[0].transactions.map(renderTransaction)}
									</div>
								) : null}
							</section>
						);
					})}
				</div>
			)}

			<CreateTransactionDialog onOpenChange={setIsModalOpen} open={isModalOpen} />
			<ImportTransactionsDialog
				onImported={setReviewingImportId}
				onOpenChange={setIsImportOpen}
				open={isImportOpen}
			/>
			<TransactionImportReviewDialog
				importId={reviewingImportId}
				onOpenChange={nextOpen => !nextOpen && setReviewingImportId(null)}
				open={reviewingImportId !== null}
			/>
			<EditTransactionDialog
				onOpenChange={open => !open && setEditingTransaction(null)}
				open={editingTransaction !== null}
				transaction={editingTransaction}
			/>
			{editingPurchase?.creditCardId && editingPurchase.installmentAmount !== undefined ? (
				<EditCreditPurchaseDialog
					cards={creditCardsQuery.data}
					creditCardId={editingPurchase.creditCardId}
					onOpenChange={open => !open && setEditingPurchase(null)}
					onRefund={
						editingPurchase.isRefund
							? undefined
							: () => {
									setRefundingPurchase(editingPurchase);
									setEditingPurchase(null);
								}
					}
					onSubmit={async data => {
						await updatePurchase.mutateAsync({ data, transaction: editingPurchase });
					}}
					open
					pending={updatePurchase.isPending}
					purchase={transactionToCreditPurchase(editingPurchase)}
				/>
			) : null}
			{refundingPurchase?.creditCardId && refundingPurchase.installmentAmount !== undefined ? (
				<RefundCreditPurchaseDialog
					onDelete={async () => {
						await deleteRefundPurchase.mutateAsync(refundingPurchase);
					}}
					onOpenChange={open => !open && setRefundingPurchase(null)}
					onSubmit={async data => {
						await refundPurchase.mutateAsync({ data, transaction: refundingPurchase });
					}}
					open
					pending={refundPurchase.isPending || deleteRefundPurchase.isPending}
					purchase={transactionToCreditPurchase(refundingPurchase)}
					refund={refundingPurchase.refund}
				/>
			) : null}
		</PageContainer>
	);
}

export const Route = createFileRoute("/transactions")({ component: TransactionsPage });
