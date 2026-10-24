import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { HiPlus } from "react-icons/hi2";
import { LuArrowLeftRight, LuEye, LuFileUp } from "react-icons/lu";
import { PendingNotices } from "@/components/pending-notices";
import {
	ImportTransactionsDialog,
	TransactionImportReviewDialog,
	TransferSuggestionsDialog,
} from "@/components/transaction-imports";
import { TransferSuggestionDecisionDialog } from "@/components/transaction-imports/TransferSuggestionDecisionDialog";
import { CreateTransactionDialog, EditTransactionDialog, TransactionsList } from "@/components/transactions";
import { ActionNotice } from "@/components/ui/ActionNotice";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalTime } from "@/lib/date";
import type { FinancialAccountYieldEntry } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { EditFinancialAccountYieldDialog } from "@/routes/accounts/components/EditFinancialAccountYieldDialog";
import { EditCreditPurchaseDialog } from "@/routes/credit-cards/components/EditCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "@/routes/credit-cards/components/RefundCreditPurchaseDialog";
import {
	countActiveTransactionFilters,
	initialTransactionFilters,
	type TransactionFilters as TransactionFiltersValue,
	type TransactionQueryFilters,
	toTransactionQueryFilters,
} from "@/routes/transactions/-transaction-filters";
import { transactionToCreditPurchase } from "@/routes/transactions/-transaction-to-credit-purchase";
import { uniqueTransactions } from "@/routes/transactions/-unique-transactions";
import { TransactionFilters } from "@/routes/transactions/components";
import { showToast } from "@/stores";

const transactionsPageSize = 50;
const searchResultsPageSize = 10;
interface TransactionsPageParam extends TransactionQueryFilters {
	cursor?: string;
	limit?: number;
}
interface TransactionsDailyPage {
	days: Array<{
		date: string;
		endingBalance: number;
		endingBalances?: Array<{ currency: string; amount: number }>;
		transactions: Transaction[];
	}>;
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
	const [transferSuggestionsOpen, setTransferSuggestionsOpen] = useState(false);
	const [transferSuggestionDecision, setTransferSuggestionDecision] = useState<{
		counterpart: Transaction;
		transaction: Transaction;
	} | null>(null);
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
	const yieldsMatchFilters =
		(filters.type === "all" || filters.type === "INCOME") &&
		filters.source !== "CREDIT_CARD" &&
		filters.categoryId === "all" &&
		(!filters.search || "rendimento".includes(filters.search.trim().toLocaleLowerCase("pt-BR")));
	const transactionDays = transactionsQuery.data?.pages.flatMap(page => page.days) ?? [];
	const transactionQueryFilters = toTransactionQueryFilters(filters);
	const yieldFilters = {
		endDate: filters.dateRange.endDate || undefined,
		startDate:
			filters.dateRange.startDate ||
			(transactionsQuery.hasNextPage ? transactionDays.at(-1)?.date : undefined),
		visibility: filters.visibility === "all" ? undefined : filters.visibility,
	} as const;
	const yieldQueryScope = [
		...queryKeys.accountYields.all(identity!),
		"transaction-list",
		transactionQueryFilters,
	] as const;
	const yieldsQuery = useInfiniteQuery<
		Awaited<ReturnType<typeof dataService.accountYields.getDisplayPage>>,
		Error,
		import("@tanstack/react-query").InfiniteData<
			Awaited<ReturnType<typeof dataService.accountYields.getDisplayPage>>
		>,
		readonly unknown[],
		string | undefined
	>({
		enabled: identity !== null && yieldsMatchFilters && !transactionsQuery.isPending,
		getNextPageParam: page => page.nextCursor ?? undefined,
		initialPageParam: undefined as string | undefined,
		// Pagination widens the yield interval. Keep existing rows mounted while it loads,
		// but retain the initial loading state when the user changes filters.
		placeholderData: (previousData, previousQuery) =>
			JSON.stringify(previousQuery?.queryKey.slice(0, -1)) === JSON.stringify(yieldQueryScope)
				? previousData
				: undefined,
		queryFn: ({ pageParam }) =>
			dataService.accountYields.getDisplayPage(
				filters.accountId === "all" ? undefined : filters.accountId,
				pageParam,
				yieldFilters,
			),
		queryKey: [...yieldQueryScope, yieldFilters],
	});
	const accountNames = new Map(yieldsQuery.data?.pages.flatMap(page => page.accountNames));

	const yieldEntries = (yieldsQuery.data?.pages.flatMap(page => page.items) ?? []).filter(entry => {
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
	const transactions = uniqueTransactions(transactionDays.map(day => day.transactions));
	const hasActiveFilters = countActiveTransactionFilters(filters) > 0;
	const creditCardsQuery = useQuery({
		enabled: identity !== null && editingPurchase !== null,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});

	const transferSuggestionsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.transactions.getTransferSuggestions(),
		queryKey: [...queryKeys.transactions.list(identity!, {}), "transfer-suggestions"],
	});
	const visibleTransferSuggestions = transferSuggestionsQuery.data ?? [];
	const acceptTransferSuggestion = useMutation({
		meta: { cacheOperations: ["transaction"] },
		mutationFn: ({ counterpart, transaction }: { counterpart: Transaction; transaction: Transaction }) =>
			dataService.transactions.acceptTransferSuggestion(transaction.id, counterpart.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setTransferSuggestionDecision(null);
			showToast("Movimentos combinados como transferência.", "positive");
		},
	});
	const rejectTransferSuggestion = useMutation({
		meta: { cacheOperations: ["transaction"] },
		mutationFn: ({ counterpart, transaction }: { counterpart: Transaction; transaction: Transaction }) =>
			dataService.transactions.rejectTransferSuggestion(transaction.id, counterpart.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setTransferSuggestionDecision(null);
			showToast("Sugestão de transferência ignorada.", "info");
		},
	});

	const dailyEndingBalances = new Map(
		transactionDays.map(day => [
			day.date,
			day.endingBalances ?? [{ amount: day.endingBalance, currency: "BRL" }],
		]),
	);
	const removeYield = useMutation({
		meta: { cacheOperations: ["yield"] },
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
			showToast("Rendimento excluído.", "positive");
		},
	});
	const remove = useMutation({
		meta: { cacheOperations: ["transaction"] },
		mutationFn: (id: string) => dataService.transactions.delete(id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Transação excluída.", "positive");
		},
	});
	const updatePurchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: ({
			data,
			transaction,
		}: {
			data: Parameters<typeof dataService.creditCards.updatePurchase>[2];
			transaction: Transaction;
		}) => {
			if (!transaction.creditCardId) throw new Error("Cartão da compra não encontrado");
			return dataService.creditCards.updatePurchase(
				transaction.creditCardId,
				transaction.isSynced && transaction.parentId ? transaction.parentId : transaction.id,
				data,
			);
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
			showToast("Compra atualizada.", "positive");
		},
	});
	const removePurchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: (transaction: Transaction) => {
			if (!transaction.creditCardId) throw new Error("Cartão da compra não encontrado");
			return dataService.creditCards.deletePurchase(transaction.creditCardId, transaction.id);
		},
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível excluir a compra.", "negative"),
		onSuccess: async () => {
			showToast("Compra excluída.", "positive");
		},
	});
	const refundPurchase = useMutation({
		meta: { cacheOperations: ["statement"] },
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

			showToast("Reembolso registrado e faturas recalculadas.", "positive");
		},
	});
	const deleteRefundPurchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: (transaction: Transaction) => {
			const refundId = transaction.isRefund ? transaction.id : transaction.refund?.id;
			if (!transaction.creditCardId || !refundId) throw new Error("Reembolso não encontrado");
			return dataService.creditCards.deletePurchase(transaction.creditCardId, refundId);
		},
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível excluir o reembolso.", "negative"),
		onSuccess: async () => {
			setRefundingPurchase(null);

			showToast("Reembolso excluído e faturas recalculadas.", "positive");
		},
	});

	return (
		<PageContainer className="space-y-6">
			<PageHeader
				actions={[
					{ icon: HiPlus, label: "Adicionar", onClick: () => setIsModalOpen(true), variant: "default" },
					{ icon: LuFileUp, label: "Importar extrato", onClick: () => setIsImportOpen(true) },
				]}
				description="Acompanhe entradas, saídas, transferências e rendimentos."
				title="Transações"
			/>
			<PendingNotices onReviewTransactionImport={setReviewingImportId} paymentSuggestions />
			{!transferSuggestionsQuery.isPending && visibleTransferSuggestions.length > 0 ? (
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
				error={transferSuggestionsQuery.error?.message}
				isPending={transferSuggestionsQuery.isPending}
				onOpenChange={setTransferSuggestionsOpen}
				onRetry={() => void transferSuggestionsQuery.refetch()}
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

			<TransactionsList
				dailyEndingBalances={dailyEndingBalances}
				hasActiveFilters={hasActiveFilters}
				hasMoreTransactions={transactionsQuery.hasNextPage}
				hasMoreYields={yieldsQuery.hasNextPage}
				isDeletingTransaction={transaction =>
					(transaction.source === "CREDIT_CARD" ? removePurchase.isPending : remove.isPending) &&
					(transaction.source === "CREDIT_CARD" ? removePurchase.variables?.id : remove.variables) ===
						transaction.id
				}
				isDeletingYield={entry => removeYield.isPending && removeYield.variables?.id === entry.id}
				isError={
					(transactionsQuery.isError && transactionsQuery.data === undefined) ||
					(yieldsMatchFilters && yieldsQuery.isError && yieldsQuery.data === undefined)
				}
				isFetchingMoreTransactions={transactionsQuery.isFetchingNextPage}
				isFetchingMoreYields={yieldsQuery.isFetchingNextPage}
				isPending={transactionsQuery.isPending || (yieldsMatchFilters && yieldsQuery.isPending)}
				onDeleteTransaction={transaction => {
					if (transaction.source === "CREDIT_CARD") removePurchase.mutate(transaction);
					else remove.mutate(transaction.id);
				}}
				onDeleteYield={entry => removeYield.mutateAsync(entry)}
				onEditTransaction={transaction =>
					transaction.source === "CREDIT_CARD"
						? transaction.isRefund
							? setRefundingPurchase(transaction)
							: setEditingPurchase(transaction)
						: setEditingTransaction(transaction)
				}
				onEditYield={setEditingYield}
				onLoadMoreTransactions={transactionsQuery.fetchNextPage}
				onLoadMoreYields={yieldsQuery.fetchNextPage}
				onRetry={() =>
					Promise.all([transactionsQuery.refetch(), ...(yieldsMatchFilters ? [yieldsQuery.refetch()] : [])])
				}
				refreshError={
					(transactionsQuery.isError && transactionsQuery.data !== undefined) ||
					(yieldsMatchFilters && yieldsQuery.isError && yieldsQuery.data !== undefined)
				}
				refreshPending={
					(transactionsQuery.isFetching &&
						!transactionsQuery.isPending &&
						!transactionsQuery.isFetchingNextPage) ||
					(yieldsMatchFilters &&
						yieldsQuery.isFetching &&
						!yieldsQuery.isPending &&
						!yieldsQuery.isFetchingNextPage)
				}
				transactionMetadata={transaction =>
					visibleTransferSuggestions.some(
						item => item.transaction.id === transaction.id || item.counterpart.id === transaction.id,
					) ? (
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
							<span className="inline-flex items-center gap-1 text-primary">
								<LuArrowLeftRight /> Transferência sugerida
							</span>
							{formatLocalTime(transaction.time) ? (
								<span className="text-muted-foreground">{formatLocalTime(transaction.time)}</span>
							) : null}
						</div>
					) : undefined
				}
				transactions={transactions}
				yieldAccountNames={accountNames}
				yieldEntries={yieldEntries}
			/>

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
