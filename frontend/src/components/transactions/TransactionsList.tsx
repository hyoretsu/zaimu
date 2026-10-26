import { type ReactNode, useEffect, useRef } from "react";
import { HiArrowsRightLeft } from "react-icons/hi2";
import { LuLoaderCircle } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUrlViewSet } from "@/hooks/use-url-view-state";
import type { Transaction } from "@/lib/api";
import { formatLocalDate, formatLocalTime, getLocalDateKey } from "@/lib/date";
import type { FinancialAccountYieldEntry } from "@/lib/financial-account";
import { groupTransactionsForDisplay, sumYieldsByCurrency } from "@/lib/transaction-display-groups";
import { sortTransactionsByMostRecent } from "@/lib/transaction-sort";
import { FinancialAccountYieldStatementItem } from "./FinancialAccountYieldStatementItem";
import { TransactionDateHeader } from "./TransactionDateHeader";
import { TransactionListItem } from "./TransactionListItem";
import { TransactionsGroupToggle } from "./TransactionsGroupToggle";

type TransactionDisplayEntry =
	| {
			date: string;
			id: string;
			isHidden?: boolean;
			kind: "transaction";
			time?: string | null;
			value: Transaction;
	  }
	| {
			date: string;
			id: string;
			isHidden?: boolean;
			kind: "yield";
			time?: string | null;
			value: FinancialAccountYieldEntry;
	  };

interface TransactionsListProps {
	viewKey?: string;
	transactions: Transaction[];
	yieldEntries?: FinancialAccountYieldEntry[];
	dailyEndingBalances: ReadonlyMap<string, Array<{ currency: string; amount: number }>>;
	onEditTransaction: (transaction: Transaction) => void;
	onDeleteTransaction: (transaction: Transaction) => void | Promise<void>;
	canDeleteTransaction?: (transaction: Transaction) => boolean;
	isDeletingTransaction?: (transaction: Transaction) => boolean;
	transactionMetadata?: (transaction: Transaction) => ReactNode;
	onEditYield: (entry: FinancialAccountYieldEntry) => void;
	onDeleteYield: (entry: FinancialAccountYieldEntry) => Promise<void>;
	isDeletingYield?: (entry: FinancialAccountYieldEntry) => boolean;
	yieldAccountNames?: ReadonlyMap<string, string>;
	currencyCode?: string;
	isPending?: boolean;
	isError?: boolean;
	hasActiveFilters?: boolean;
	refreshPending?: boolean;
	refreshError?: boolean;
	onRetry?: () => unknown;
	hasMoreTransactions?: boolean;
	isFetchingMoreTransactions?: boolean;
	onLoadMoreTransactions?: () => unknown;
	hasMoreYields?: boolean;
	isFetchingMoreYields?: boolean;
	onLoadMoreYields?: () => unknown;
}
export function TransactionsList({
	viewKey = "transactions",
	transactions,
	yieldEntries = [],
	dailyEndingBalances,
	onEditTransaction,
	onDeleteTransaction,
	canDeleteTransaction,
	isDeletingTransaction,
	transactionMetadata,
	onEditYield,
	onDeleteYield,
	isDeletingYield,
	yieldAccountNames,
	currencyCode,
	isPending = false,
	isError = false,
	hasActiveFilters = false,
	refreshPending = false,
	refreshError = false,
	onRetry,
	hasMoreTransactions = false,
	isFetchingMoreTransactions = false,
	onLoadMoreTransactions,
	hasMoreYields = false,
	isFetchingMoreYields = false,
	onLoadMoreYields,
}: TransactionsListProps) {
	const [expandedTransactionGroups, setExpandedTransactionGroups] = useUrlViewSet(`${viewKey}.groups`);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (
			isPending ||
			refreshError ||
			!hasMoreTransactions ||
			isFetchingMoreTransactions ||
			!onLoadMoreTransactions
		)
			return;
		const loadMoreWhenNearEnd = () => {
			const element = loadMoreRef.current;
			if (!element || element.getBoundingClientRect().top > window.innerHeight + 1200) return;
			void onLoadMoreTransactions();
		};
		loadMoreWhenNearEnd();
		window.addEventListener("resize", loadMoreWhenNearEnd);
		window.addEventListener("scroll", loadMoreWhenNearEnd, { capture: true, passive: true });
		return () => {
			window.removeEventListener("resize", loadMoreWhenNearEnd);
			window.removeEventListener("scroll", loadMoreWhenNearEnd, true);
		};
	}, [isPending, refreshError, hasMoreTransactions, isFetchingMoreTransactions, onLoadMoreTransactions]);
	const renderEntry = (entry: TransactionDisplayEntry) => {
		if (entry.kind === "yield")
			return (
				<FinancialAccountYieldStatementItem
					accountName={yieldAccountNames?.get(entry.value.financialAccountId)}
					amount={entry.value.amount}
					currencyCode={entry.value.currency ?? currencyCode ?? "BRL"}
					deleting={isDeletingYield?.(entry.value)}
					isSynced={entry.value.isSynced}
					key={entry.id}
					onDelete={() => onDeleteYield(entry.value)}
					onEdit={() => onEditYield(entry.value)}
					time={entry.value.time}
				/>
			);
		const transaction = entry.value;
		const time = formatLocalTime(transaction.time);
		return (
			<TransactionListItem
				deleting={isDeletingTransaction?.(transaction)}
				key={entry.id}
				metadataPrefix={
					transactionMetadata?.(transaction) ??
					(time ? <span className="text-muted-foreground text-xs">{time}</span> : undefined)
				}
				onDelete={
					canDeleteTransaction?.(transaction) === false
						? undefined
						: () => onDeleteTransaction(transaction)
				}
				onEdit={() => onEditTransaction(transaction)}
				transaction={transaction}
			/>
		);
	};

	const groupedTransactions = sortTransactionsByMostRecent(transactions).reduce<
		Record<string, Transaction[]>
	>((groups, transaction) => {
		const date = transaction.date.slice(0, 10);
		if (!groups[date]) groups[date] = [];
		groups[date].push(transaction);
		return groups;
	}, {});
	const today = getLocalDateKey(new Date());
	const yieldsByDate = Map.groupBy(yieldEntries, entry => entry.date);
	const displayDates = [
		...new Set([
			...dailyEndingBalances.keys(),
			...Object.keys(groupedTransactions ?? {}),
			...yieldsByDate.keys(),
		]),
	].toSorted((a, b) => b.localeCompare(a));
	const toggleTransactionGroup = (groupId: string) => {
		setExpandedTransactionGroups(current => {
			const next = new Set(current);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	};

	return (
		<>
			<QueryRefreshStatus error={refreshError} onRetry={() => onRetry?.()} pending={refreshPending} />
			{isPending ? (
				<div className="space-y-5">
					{[1, 2, 3].map(item => (
						<div className="space-y-2" key={item}>
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-24 rounded-2xl" />
						</div>
					))}
				</div>
			) : isError ? (
				<EmptyState
					description="Não foi possível carregar suas movimentações."
					icon={<HiArrowsRightLeft />}
					title="Falha ao carregar transações"
				/>
			) : displayDates.length === 0 ? (
				<EmptyState
					description={
						hasActiveFilters
							? "Ajuste ou limpe os filtros para ver transações."
							: "Registre sua primeira movimentação para começar."
					}
					icon={<HiArrowsRightLeft />}
					title={hasActiveFilters ? "Nenhuma transação encontrada" : "Nenhuma transação"}
				/>
			) : (
				<div className="space-y-5">
					{displayDates.map(date => {
						const transactions = groupedTransactions?.[date] ?? [];
						const entries: TransactionDisplayEntry[] = [
							...transactions.map(transaction => ({
								date,
								id: transaction.id,
								isHidden: transaction.isHidden,
								kind: "transaction" as const,
								time: transaction.time,
								value: transaction,
							})),
							...(yieldsByDate.get(date) ?? []).map(entry => ({
								date,
								id: `yield-${entry.id}`,
								isHidden: entry.isHidden,
								kind: "yield" as const,
								time: entry.time,
								value: entry,
							})),
						].toSorted((left, right) =>
							(formatLocalTime(right.time) ?? "").localeCompare(
								formatLocalTime(left.time) ?? "",
							),
						);
						const displayGroups = groupTransactionsForDisplay(entries, today);
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
									endingBalance={
										dailyEndingBalances.has(date) ? (
											<PreferredMoneyAmount
												date={date}
												values={dailyEndingBalances.get(date)!}
											/>
										) : undefined
									}
								/>
								{entries.length === 0 ? (
									<EmptyState
										description="Ajuste ou limpe os filtros para ver transações."
										icon={<HiArrowsRightLeft />}
										title="Nenhuma transação encontrada"
									/>
								) : null}
								{singleCollapsedGroup ? (
									<TransactionsGroupToggle
										entryCount={singleCollapsedGroup.transactions.length}
										expanded={expandedTransactionGroups.has(singleCollapsedGroup.id)}
										kind={singleCollapsedGroup.kind === "future" ? "future" : "hidden"}
										onClick={() => toggleTransactionGroup(singleCollapsedGroup.id)}
									/>
								) : (
									displayGroups.map(group => {
										if (group.kind === "visible") {
											return (
												<div
													className="bg-card divide-y overflow-hidden rounded-2xl border shadow-sm"
													key={group.id}
												>
													{group.transactions.map(renderEntry)}
												</div>
											);
										}

										const isExpanded = expandedTransactionGroups.has(group.id);
										return (
											<div className="space-y-2" key={group.id}>
												<TransactionsGroupToggle
													entryCount={group.transactions.length}
													expanded={isExpanded}
													kind={group.kind}
													onClick={() => toggleTransactionGroup(group.id)}
													totals={
														group.kind === "yield"
															? sumYieldsByCurrency(
																	group.transactions.flatMap(entry =>
																		entry.kind === "yield"
																			? [entry.value]
																			: [],
																	),
																)
															: undefined
													}
												/>
												{isExpanded ? (
													<div className="bg-card divide-y overflow-hidden rounded-2xl border shadow-sm">
														{group.transactions.map(renderEntry)}
													</div>
												) : null}
											</div>
										);
									})
								)}
								{singleCollapsedGroup &&
								expandedTransactionGroups.has(singleCollapsedGroup.id) ? (
									<div className="bg-card divide-y overflow-hidden rounded-2xl border shadow-sm">
										{singleCollapsedGroup.transactions.map(renderEntry)}
									</div>
								) : null}
							</section>
						);
					})}
					{hasMoreYields && (
						<ActionGroup>
							<Button
								className="cursor-pointer"
								disabled={isFetchingMoreYields}
								onClick={() => void onLoadMoreYields?.()}
								variant="outline"
							>
								{isFetchingMoreYields
									? "Carregando rendimentos..."
									: "Carregar mais rendimentos"}
							</Button>
						</ActionGroup>
					)}
					{hasMoreTransactions ? (
						<div
							aria-live="polite"
							className="flex h-14 items-center justify-center"
							ref={loadMoreRef}
						>
							{isFetchingMoreTransactions ? (
								<span className="text-muted-foreground flex items-center gap-2 text-sm">
									<LuLoaderCircle aria-hidden className="animate-spin" />
									Carregando transações anteriores...
								</span>
							) : null}
						</div>
					) : null}
				</div>
			)}
		</>
	);
}
