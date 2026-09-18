import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HiArrowsRightLeft, HiPlus } from "react-icons/hi2";
import { LuArrowLeftRight, LuFileUp, LuLoaderCircle } from "react-icons/lu";
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
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { sortTransactionsByMostRecent } from "@/lib/transaction-sort";
import { EditCreditPurchaseDialog } from "@/routes/credit-cards/components/EditCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "@/routes/credit-cards/components/RefundCreditPurchaseDialog";
import { showToast } from "@/stores";
import { groupTransactionsForDisplay } from "./transactions/-transaction-display-groups";
import {
	filterTransactions,
	initialTransactionFilters,
	type TransactionFilters as TransactionFiltersValue,
} from "./transactions/-transaction-filters";
import { transactionToCreditPurchase } from "./transactions/-transaction-to-credit-purchase";
import {
	HiddenTransactionsToggle,
	TransactionDateHeader,
	TransactionFilters,
} from "./transactions/components";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const transactionsPageSize = 50;
interface TransactionsPageParam {
	endDate: string;
	offset?: number;
	startDate?: string;
}

function getInitialTransactionsPage(): TransactionsPageParam {
	const today = new Date();
	const daysSinceMonday = (today.getDay() + 6) % 7;
	const previousWeekStart = new Date(today);
	previousWeekStart.setDate(today.getDate() - daysSinceMonday - 7);
	return { endDate: getLocalDateKey(today), startDate: getLocalDateKey(previousWeekStart) };
}

function getDayBefore(date: string): string {
	const previousDay = new Date(`${date}T12:00:00`);
	previousDay.setDate(previousDay.getDate() - 1);
	return getLocalDateKey(previousDay);
}

export function TransactionsPage() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [editingPurchase, setEditingPurchase] = useState<Transaction | null>(null);
	const [refundingPurchase, setRefundingPurchase] = useState<Transaction | null>(null);
	const [filters, setFilters] = useState<TransactionFiltersValue>(initialTransactionFilters);
	const [expandedHiddenGroups, setExpandedHiddenGroups] = useState<Set<string>>(() => new Set());
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();

	const transactionsQuery = useInfiniteQuery<
		Transaction[],
		Error,
		InfiniteData<Transaction[]>,
		ReturnType<typeof queryKeys.transactions.list>,
		TransactionsPageParam
	>({
		enabled: identity !== null,
		getNextPageParam: (lastPage, _pages, lastPageParam) => {
			if (lastPage.length === 0) return undefined;
			if (lastPageParam.startDate) return { endDate: getDayBefore(lastPageParam.startDate) };
			return lastPage.length === transactionsPageSize
				? { endDate: lastPageParam.endDate, offset: (lastPageParam.offset ?? 0) + transactionsPageSize }
				: undefined;
		},
		initialPageParam: getInitialTransactionsPage(),
		queryFn: ({ pageParam }) =>
			dataService.transactions.getAll(
				pageParam.startDate ? pageParam : { limit: transactionsPageSize, ...pageParam },
			),
		queryKey: queryKeys.transactions.list(identity!, {}),
	});
	const transactions = transactionsQuery.data?.pages.flat() ?? [];
	const dashboardDateRange = transactions.length
		? {
				endDate: transactions.reduce(
					(latestDate, transaction) =>
						transaction.date.slice(0, 10) > latestDate ? transaction.date.slice(0, 10) : latestDate,
					getLocalDateKey(),
				),
				startDate: transactions.reduce(
					(earliestDate, transaction) =>
						transaction.date.slice(0, 10) < earliestDate ? transaction.date.slice(0, 10) : earliestDate,
					transactions[0].date.slice(0, 10),
				),
			}
		: undefined;
	const dashboardQuery = useQuery({
		enabled: identity !== null && dashboardDateRange !== undefined,
		queryFn: () => dataService.dashboard.get(dashboardDateRange!),
		queryKey: queryKeys.dashboard.detail(identity!, dashboardDateRange),
	});
	const creditCardsQuery = useQuery({
		enabled: identity !== null && editingPurchase !== null,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	useEffect(() => {
		if (!transactionsQuery.hasNextPage || transactionsQuery.isFetchingNextPage) return;

		const loadMoreWhenNearEnd = () => {
			const loadMoreElement = loadMoreRef.current;
			if (!loadMoreElement || loadMoreElement.getBoundingClientRect().top > window.innerHeight + 1200) return;
			void transactionsQuery.fetchNextPage();
		};

		loadMoreWhenNearEnd();
		window.addEventListener("resize", loadMoreWhenNearEnd);
		window.addEventListener("scroll", loadMoreWhenNearEnd, { capture: true, passive: true });
		return () => {
			window.removeEventListener("resize", loadMoreWhenNearEnd);
			window.removeEventListener("scroll", loadMoreWhenNearEnd, true);
		};
	}, [transactionsQuery.fetchNextPage, transactionsQuery.hasNextPage, transactionsQuery.isFetchingNextPage]);

	const transferSuggestions = transactions.flatMap((transaction, index, all) =>
		all
			.slice(index + 1)
			.flatMap(counterpart =>
				transaction.date.slice(0, 10) === counterpart.date.slice(0, 10) &&
				Number(transaction.amount) === Number(counterpart.amount) &&
				((transaction.type === "EXPENSE" && counterpart.type === "INCOME") ||
					(transaction.type === "INCOME" && counterpart.type === "EXPENSE")) &&
				transaction.originFinancialAccountId !== counterpart.destinationFinancialAccountId
					? [{ counterpart, transaction }]
					: [],
			),
	);
	const acceptTransferSuggestion = useMutation({
		mutationFn: ({ counterpart, transaction }: { counterpart: Transaction; transaction: Transaction }) =>
			dataService.transactions.acceptTransferSuggestion(transaction.id, counterpart.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			showToast("Movimentos combinados como transferência.", "positive");
		},
	});

	const filteredTransactions = transactionsQuery.data ? filterTransactions(transactions, filters) : undefined;
	const groupedTransactions = filteredTransactions
		? sortTransactionsByMostRecent(filteredTransactions).reduce<Record<string, Transaction[]>>(
				(groups, transaction) => {
					const date = transaction.date.slice(0, 10);
					if (!groups[date]) groups[date] = [];
					groups[date].push(transaction);
					return groups;
				},
				{},
			)
		: undefined;
	const dailyEndingBalances = new Map(
		dashboardQuery.data?.dailyBalances.map(item => [item.date, item.balance]) ?? [],
	);
	const remove = useMutation({
		mutationFn: (id: string) => dataService.transactions.delete(id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "transaction");
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
			await invalidateCacheOperation(queryClient, identity!, "statement");
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
			await invalidateCacheOperation(queryClient, identity!, "statement");
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
			await invalidateCacheOperation(queryClient, identity!, "statement");
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
			await invalidateCacheOperation(queryClient, identity!, "statement");
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
					transferSuggestions.some(
						item => item.transaction.id === transaction.id || item.counterpart.id === transaction.id,
					) ? (
						<span className="inline-flex items-center gap-1 text-primary text-xs">
							<LuArrowLeftRight /> Transferência sugerida
						</span>
					) : transactionTime ? (
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
							<LuFileUp /> Importar extrato
						</Button>
					</div>
				}
				description="Acompanhe entradas, saídas e transferências."
				title="Transações"
			/>
			<PendingTransactionImportsNotice onReview={setReviewingImportId} />
			{transferSuggestions.length ? (
				<section className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
					<div className="flex items-center gap-3">
						<LuArrowLeftRight className="text-primary" />
						<div>
							<p className="font-semibold">Transferências sugeridas</p>
							<p className="text-muted-foreground text-sm">
								{transferSuggestions.length}{" "}
								{transferSuggestions.length === 1 ? "par encontrado" : "pares encontrados"} no mesmo dia.
							</p>
						</div>
					</div>
					<div className="mt-3 space-y-2">
						{transferSuggestions.map(({ counterpart, transaction }) => (
							<Button
								className="w-full cursor-pointer justify-between"
								disabled={acceptTransferSuggestion.isPending}
								key={`${transaction.id}-${counterpart.id}`}
								onClick={() => acceptTransferSuggestion.mutate({ counterpart, transaction })}
								variant="outline"
							>
								<span className="min-w-0 truncate">
									{transaction.description || "Saída"} ↔ {counterpart.description || "Entrada"}
								</span>
								<span className="shrink-0">
									<LuArrowLeftRight /> Combinar
								</span>
							</Button>
						))}
					</div>
				</section>
			) : null}

			<TransactionFilters
				filters={filters}
				onChange={setFilters}
				onClear={() => setFilters(initialTransactionFilters)}
				transactions={transactions}
			/>

			{transactionsQuery.isPending || (dashboardQuery.isPending && !dashboardQuery.data) ? (
				<div className="space-y-5">
					{[1, 2, 3].map(item => (
						<div className="space-y-2" key={item}>
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-24 rounded-2xl" />
						</div>
					))}
				</div>
			) : transactionsQuery.isError || dashboardQuery.isError ? (
				<EmptyState
					description="Não foi possível carregar suas movimentações."
					icon={<HiArrowsRightLeft />}
					title="Falha ao carregar transações"
				/>
			) : !groupedTransactions || Object.keys(groupedTransactions).length === 0 ? (
				<EmptyState
					description={
						transactions.length
							? "Ajuste ou limpe os filtros para ver transações."
							: "Registre sua primeira movimentação para começar."
					}
					icon={<HiArrowsRightLeft />}
					title={transactions.length ? "Nenhuma transação encontrada" : "Nenhuma transação"}
				/>
			) : (
				<div className="space-y-5">
					{Object.entries(groupedTransactions).map(([date, transactions]) => {
						const displayGroups = groupTransactionsForDisplay(transactions);
						const allTransactionsHidden = displayGroups[0]?.kind === "hidden" && displayGroups.length === 1;
						const dayLabel = `${formatLocalDate(date, { weekday: "long" }).replace(/^./, character => character.toUpperCase())}, ${formatLocalDate(date)}`;

						return (
							<section className="space-y-2" key={date}>
								<TransactionDateHeader
									dateLabel={dayLabel}
									endingBalance={currency.format(dailyEndingBalances.get(date) ?? 0)}
								/>
								{allTransactionsHidden ? (
									<HiddenTransactionsToggle
										expanded={expandedHiddenGroups.has(displayGroups[0].id)}
										hiddenCount={displayGroups[0].transactions.length}
										onClick={() => toggleHiddenGroup(displayGroups[0].id)}
									/>
								) : (
									displayGroups.map(group => {
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
									})
								)}
								{allTransactionsHidden && expandedHiddenGroups.has(displayGroups[0].id) ? (
									<div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
										{displayGroups[0].transactions.map(renderTransaction)}
									</div>
								) : null}
							</section>
						);
					})}
					{transactionsQuery.hasNextPage ? (
						<div aria-live="polite" className="flex h-14 items-center justify-center" ref={loadMoreRef}>
							{transactionsQuery.isFetchingNextPage ? (
								<span className="flex items-center gap-2 text-muted-foreground text-sm">
									<LuLoaderCircle aria-hidden className="animate-spin" />
									Carregando transações anteriores…
								</span>
							) : null}
						</div>
					) : null}
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
