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
import { LuArrowLeftRight, LuEye, LuFileUp, LuLoaderCircle } from "react-icons/lu";
import {
	ImportTransactionsDialog,
	PendingTransactionImportsNotice,
	TransactionImportReviewDialog,
	TransferSuggestionsDialog,
} from "@/components/transaction-imports";
import { TransferSuggestionDecisionDialog } from "@/components/transaction-imports/TransferSuggestionDecisionDialog";
import {
	CreateTransactionDialog,
	EditTransactionDialog,
	TransactionListItem,
} from "@/components/transactions";
import { ActionNotice } from "@/components/ui/ActionNotice";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/date";
import {
	calculateFinancialAccountYieldEntries,
	type FinancialAccountYieldEntry,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { sortTransactionsByMostRecent } from "@/lib/transaction-sort";
import { EditFinancialAccountYieldDialog } from "@/routes/accounts/components/EditFinancialAccountYieldDialog";
import { FinancialAccountYieldStatementItem } from "@/routes/accounts/components/FinancialAccountYieldStatementItem";
import { EditCreditPurchaseDialog } from "@/routes/credit-cards/components/EditCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "@/routes/credit-cards/components/RefundCreditPurchaseDialog";
import { showToast } from "@/stores";
import { groupTransactionsForDisplay } from "./transactions/-transaction-display-groups";
import {
	initialTransactionFilters,
	type TransactionFilters as TransactionFiltersValue,
	type TransactionQueryFilters,
	toTransactionQueryFilters,
} from "./transactions/-transaction-filters";
import { transactionToCreditPurchase } from "./transactions/-transaction-to-credit-purchase";
import { uniqueTransactions } from "./transactions/-unique-transactions";
import {
	TransactionDateHeader,
	TransactionFilters,
	TransactionsGroupToggle,
} from "./transactions/components";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const transactionsPageSize = 50;
const searchResultsPageSize = 10;
interface TransactionsPageParam extends TransactionQueryFilters {
	cursor?: string;
	limit?: number;
}
interface TransactionsDailyPage {
	days: Array<{ date: string; endingBalance: number; transactions: Transaction[] }>;
	hasMore: boolean;
	nextCursor: null | string;
}

function getInitialTransactionsPage(filters: TransactionFiltersValue): TransactionsPageParam {
	const queryFilters = toTransactionQueryFilters(filters);
	if (Object.keys(queryFilters).length > 0)
		return { ...queryFilters, limit: filters.search ? searchResultsPageSize : transactionsPageSize };

	return { limit: transactionsPageSize };
}

export function TransactionsPage() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [editingYield, setEditingYield] = useState<FinancialAccountYieldEntry | null>(null);
	const [editingPurchase, setEditingPurchase] = useState<Transaction | null>(null);
	const [pendingPurchaseUpdateIds, setPendingPurchaseUpdateIds] = useState<Set<string>>(new Set());
	const [refundingPurchase, setRefundingPurchase] = useState<Transaction | null>(null);
	const [filters, setFilters] = useState<TransactionFiltersValue>(initialTransactionFilters);
	const [expandedTransactionGroups, setExpandedTransactionGroups] = useState<Set<string>>(() => new Set());
	const [transferSuggestionsOpen, setTransferSuggestionsOpen] = useState(false);
	const [transferSuggestionDecision, setTransferSuggestionDecision] = useState<{
		counterpart: Transaction;
		transaction: Transaction;
	} | null>(null);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();

	const transactionsQuery = useInfiniteQuery<
		TransactionsDailyPage,
		Error,
		InfiniteData<TransactionsDailyPage>,
		ReturnType<typeof queryKeys.transactions.list>,
		TransactionsPageParam
	>({
		enabled: identity !== null,
		getNextPageParam: (lastPage, _pages, lastPageParam) =>
			lastPage.hasMore && lastPage.nextCursor ? { ...lastPageParam, cursor: lastPage.nextCursor } : undefined,
		initialPageParam: getInitialTransactionsPage(filters),
		queryFn: ({ pageParam }) =>
			dataService.transactions.getDailyPage(
				pageParam.startDate ? pageParam : { limit: transactionsPageSize, ...pageParam },
			),
		queryKey: queryKeys.transactions.list(identity!, toTransactionQueryFilters(filters)),
	});
	const yieldsQuery = useQuery({
		enabled: identity !== null,
		queryFn: async () => {
			const [accounts, transactions, holidays] = await Promise.all([
				dataService.accounts.getAll(),
				dataService.transactions.getAll(),
				dataService.accountYieldHolidays.getAll(),
			]);
			return (
				await Promise.all(
					accounts
						.filter(account => account.type !== "CREDIT_CARD")
						.map(async account => {
							const items = [];
							let cursor: string | null = null;
							do {
								const page = await dataService.accountYields.getPage(account.id, cursor);
								items.push(...page.items);
								cursor = page.nextCursor;
							} while (cursor);
							return calculateFinancialAccountYieldEntries(
								account,
								transactions.filter(transaction => transaction.source !== "CREDIT_CARD"),
								holidays.map(holiday => holiday.date),
								undefined,
								items,
							);
						}),
				)
			).flat();
		},
		queryKey: [...queryKeys.accountYields.all(identity!), "transaction-list"],
	});
	const yieldEntries = (yieldsQuery.data ?? []).filter(entry => {
		if (filters.type !== "all" && filters.type !== "INCOME") return false;
		if (filters.source === "CREDIT_CARD" || filters.categoryId !== "all") return false;
		if (filters.accountId !== "all" && filters.accountId !== entry.financialAccountId) return false;
		if (filters.visibility !== "all" && filters.visibility !== (entry.isHidden ? "hidden" : "visible"))
			return false;
		if (filters.dateRange.startDate && entry.date < filters.dateRange.startDate) return false;
		if (filters.dateRange.endDate && entry.date > filters.dateRange.endDate) return false;
		if (filters.search && !"rendimento".includes(filters.search.trim().toLocaleLowerCase("pt-BR")))
			return false;
		return true;
	});
	const transactionDays = transactionsQuery.data?.pages.flatMap(page => page.days) ?? [];
	const transactions = uniqueTransactions(transactionDays.map(day => day.transactions));
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

	const transferSuggestionsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.transactions.getTransferSuggestions(),
		queryKey: [...queryKeys.transactions.list(identity!, {}), "transfer-suggestions"],
	});
	const visibleTransferSuggestions = transferSuggestionsQuery.data ?? [];
	const acceptTransferSuggestion = useMutation({
		mutationFn: ({ counterpart, transaction }: { counterpart: Transaction; transaction: Transaction }) =>
			dataService.transactions.acceptTransferSuggestion(transaction.id, counterpart.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setTransferSuggestionDecision(null);
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			await queryClient.invalidateQueries({
				queryKey: [...queryKeys.transactions.list(identity!, {}), "transfer-suggestions"],
			});
			showToast("Movimentos combinados como transferência.", "positive");
		},
	});
	const rejectTransferSuggestion = useMutation({
		mutationFn: ({ counterpart, transaction }: { counterpart: Transaction; transaction: Transaction }) =>
			dataService.transactions.rejectTransferSuggestion(transaction.id, counterpart.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setTransferSuggestionDecision(null);
			await queryClient.invalidateQueries({
				queryKey: [...queryKeys.transactions.list(identity!, {}), "transfer-suggestions"],
			});
			showToast("Sugestão de transferência ignorada.", "info");
		},
	});

	const filteredTransactions = transactionsQuery.data ? transactions : undefined;
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
	const dailyEndingBalances = new Map(transactionDays.map(day => [day.date, day.endingBalance]));
	const today = getLocalDateKey(new Date());
	const yieldsByDate = Map.groupBy(yieldEntries, entry => entry.date);
	const displayDates = [
		...new Set([...Object.keys(groupedTransactions ?? {}), ...yieldsByDate.keys()]),
	].toSorted((a, b) => b.localeCompare(a));
	const removeYield = useMutation({
		mutationFn: async (entry: FinancialAccountYieldEntry) => {
			if (entry.kind === "AUTOMATIC")
				await dataService.accountYields.upsertAutomatic({
					date: entry.date,
					financialAccountId: entry.financialAccountId,
					isExcluded: true,
				});
			else await dataService.accountYields.delete(entry.id);
		},
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "yield");
			showToast("Rendimento excluído.", "positive");
		},
	});
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
		onMutate: ({ transaction }) =>
			setPendingPurchaseUpdateIds(current => new Set(current).add(transaction.id)),
		onSettled: (_data, _error, { transaction }) =>
			setPendingPurchaseUpdateIds(current => {
				const next = new Set(current);
				next.delete(transaction.id);
				return next;
			}),
		onSuccess: async () => {
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
			const refundId = transaction.isRefund ? transaction.id : undefined;
			const purchaseId = transaction.isRefund ? transaction.refundOfPurchaseId : transaction.id;
			if (!purchaseId) throw new Error("Compra do reembolso não encontrada");
			return refundId
				? dataService.creditCards.updateRefund(transaction.creditCardId, purchaseId, refundId, {
						amount: data.amount ?? transaction.refund?.amount ?? transaction.amount,
						date: data.date ?? transaction.refund?.date.slice(0, 10) ?? transaction.date.slice(0, 10),
					})
				: dataService.creditCards.refundPurchase(transaction.creditCardId, purchaseId, data);
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
			const refundId = transaction.isRefund ? transaction.id : transaction.refund?.id;
			if (!transaction.creditCardId || !refundId) throw new Error("Reembolso não encontrado");
			return dataService.creditCards.deletePurchase(transaction.creditCardId, refundId);
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
					visibleTransferSuggestions.some(
						item => item.transaction.id === transaction.id || item.counterpart.id === transaction.id,
					) ? (
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
							<span className="inline-flex items-center gap-1 text-primary">
								<LuArrowLeftRight /> Transferência sugerida
							</span>
							{transactionTime ? <span className="text-muted-foreground">{transactionTime}</span> : null}
						</div>
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
						? () =>
								transaction.isRefund ? setRefundingPurchase(transaction) : setEditingPurchase(transaction)
						: () => setEditingTransaction(transaction)
				}
				transaction={transaction}
			/>
		);
	};
	const toggleTransactionGroup = (groupId: string) => {
		setExpandedTransactionGroups(current => {
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
			{visibleTransferSuggestions.length ? (
				<ActionNotice
					action={
						<Button
							className="cursor-pointer"
							onClick={() => setTransferSuggestionsOpen(true)}
							variant="outline"
						>
							<LuEye aria-hidden="true" /> Ver transferências
						</Button>
					}
					description={`${visibleTransferSuggestions.length} ${visibleTransferSuggestions.length === 1 ? "par encontrado" : "pares encontrados"} no mesmo dia.`}
					icon={<LuArrowLeftRight aria-hidden="true" className="size-5 text-primary" />}
					title="Transferências sugeridas"
				/>
			) : null}
			<TransferSuggestionsDialog
				onOpenChange={setTransferSuggestionsOpen}
				onSelect={suggestion => {
					setTransferSuggestionsOpen(false);
					setTransferSuggestionDecision(suggestion);
				}}
				open={transferSuggestionsOpen}
				suggestions={visibleTransferSuggestions}
			/>
			<TransferSuggestionDecisionDialog
				counterpartTransaction={transferSuggestionDecision?.counterpart ?? null}
				currentTransaction={transferSuggestionDecision?.transaction ?? null}
				onAccept={() => {
					if (transferSuggestionDecision) acceptTransferSuggestion.mutate(transferSuggestionDecision);
				}}
				onOpenChange={open => !open && setTransferSuggestionDecision(null)}
				onReject={() => {
					if (!transferSuggestionDecision) return;
					rejectTransferSuggestion.mutate(transferSuggestionDecision);
				}}
				open={transferSuggestionDecision !== null}
				pending={acceptTransferSuggestion.isPending || rejectTransferSuggestion.isPending}
				rejectConfirmation={null}
				rejectLabel="Ignorar"
			/>

			<TransactionFilters
				filters={filters}
				onChange={setFilters}
				onClear={() => setFilters(initialTransactionFilters)}
				transactions={transactions}
			/>

			{transactionsQuery.isPending || (yieldsQuery.isPending && transactions.length === 0) ? (
				<div className="space-y-5">
					{[1, 2, 3].map(item => (
						<div className="space-y-2" key={item}>
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-24 rounded-2xl" />
						</div>
					))}
				</div>
			) : transactionsQuery.isError || (yieldsQuery.isError && transactions.length === 0) ? (
				<EmptyState
					description="Não foi possível carregar suas movimentações."
					icon={<HiArrowsRightLeft />}
					title="Falha ao carregar transações"
				/>
			) : displayDates.length === 0 ? (
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
					{displayDates.map(date => {
						const transactions = groupedTransactions?.[date] ?? [];
						const displayGroups = groupTransactionsForDisplay(transactions, today);
						const [onlyDisplayGroup] = displayGroups;
						const singleCollapsedGroup =
							displayGroups.length === 1 &&
							(onlyDisplayGroup?.kind === "hidden" || onlyDisplayGroup?.kind === "future")
								? onlyDisplayGroup
								: null;
						const dayLabel = `${formatLocalDate(date, { weekday: "long" }).replace(/^./, character => character.toUpperCase())}, ${formatLocalDate(date)}`;

						return (
							<section className="space-y-2" key={date}>
								<TransactionDateHeader
									dateLabel={dayLabel}
									endingBalance={currency.format(dailyEndingBalances.get(date) ?? 0)}
								/>
								{yieldsByDate.get(date)?.length ? (
									<div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
										{yieldsByDate.get(date)?.map(entry => (
											<FinancialAccountYieldStatementItem
												amount={entry.amount}
												deleting={removeYield.isPending && removeYield.variables?.id === entry.id}
												key={`yield-${entry.id}`}
												onDelete={() => removeYield.mutateAsync(entry)}
												onEdit={() => setEditingYield(entry)}
												time={entry.time}
											/>
										))}
									</div>
								) : null}
								{singleCollapsedGroup ? (
									<TransactionsGroupToggle
										expanded={expandedTransactionGroups.has(singleCollapsedGroup.id)}
										kind={singleCollapsedGroup.kind === "future" ? "future" : "hidden"}
										onClick={() => toggleTransactionGroup(singleCollapsedGroup.id)}
										transactionCount={singleCollapsedGroup.transactions.length}
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

										const isExpanded = expandedTransactionGroups.has(group.id);
										return (
											<div className="space-y-2" key={group.id}>
												<TransactionsGroupToggle
													expanded={isExpanded}
													kind={group.kind}
													onClick={() => toggleTransactionGroup(group.id)}
													transactionCount={group.transactions.length}
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
								{singleCollapsedGroup && expandedTransactionGroups.has(singleCollapsedGroup.id) ? (
									<div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
										{singleCollapsedGroup.transactions.map(renderTransaction)}
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
			<EditFinancialAccountYieldDialog
				entry={editingYield}
				onOpenChange={open => !open && setEditingYield(null)}
				open={editingYield !== null}
			/>
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
					pending={pendingPurchaseUpdateIds.has(editingPurchase.id)}
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
					refund={refundingPurchase.isRefund ? refundingPurchase.refund : undefined}
					refundId={refundingPurchase.isRefund ? refundingPurchase.id : undefined}
				/>
			) : null}
		</PageContainer>
	);
}

export const Route = createFileRoute("/transactions")({ component: TransactionsPage });
