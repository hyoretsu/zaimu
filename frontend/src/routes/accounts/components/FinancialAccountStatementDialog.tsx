import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuPlus, LuScale } from "react-icons/lu";
import { CreateTransactionDialog, EditTransactionDialog, TransactionsList } from "@/components/transactions";
import { ActionGroup } from "@/components/ui/ActionGroup";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FloatingActionMenu } from "@/components/ui/FloatingActionMenu";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { FinancialAccount, Transaction } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { type FinancialAccountYieldEntry, getFinancialAccountDisplayName } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { BalanceAdjustmentsDialog } from "./BalanceAdjustmentsDialog";
import { EditFinancialAccountYieldDialog } from "./EditFinancialAccountYieldDialog";

export function FinancialAccountStatementDialog({
	account,
	onOpenChange,
	open,
}: {
	account: FinancialAccount;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const requestedRecovery = useModalRecoveryStore(state =>
		state.requestedId ? state.entries[state.requestedId] : undefined,
	);
	useEffect(() => {
		if (requestedRecovery?.kind !== "yield-edit" || requestedRecovery.identity !== identity) return;
		const payload = requestedRecovery.payload as { entry: FinancialAccountYieldEntry };
		if (
			payload.entry.financialAccountId === account.id &&
			requestedRecovery.path === window.location.pathname + window.location.search
		)
			onOpenChange(true);
	}, [requestedRecovery, identity, account.id, onOpenChange]);
	const statement = useInfiniteQuery<
		Awaited<ReturnType<typeof dataService.transactions.getDailyPage>>,
		Error,
		import("@tanstack/react-query").InfiniteData<
			Awaited<ReturnType<typeof dataService.transactions.getDailyPage>>
		>,
		readonly unknown[],
		string | undefined
	>({
		enabled: identity !== null && open,
		getNextPageParam: page => page.nextCursor ?? undefined,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			dataService.transactions.getDailyPage({
				cursor: pageParam,
				financialAccountId: account.id,
				limit: 50,
			}),
		queryKey: queryKeys.transactions.byAccount(identity!, account.id),
	});
	const statementItems =
		statement.data?.pages.flatMap(page => page.days.flatMap(day => day.transactions)) ?? [];

	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [creatingTransaction, setCreatingTransaction] = useState(false);
	const [adjustingBalance, setAdjustingBalance] = useState(false);
	const [editingYield, setEditingYield] = useState<FinancialAccountYieldEntry | null>(null);
	const yieldFilters = {
		startDate: statement.hasNextPage ? statement.data?.pages.at(-1)?.days.at(-1)?.date : undefined,
	};
	const yields = useInfiniteQuery<
		Awaited<ReturnType<typeof dataService.accountYields.getDisplayPage>>,
		Error,
		import("@tanstack/react-query").InfiniteData<
			Awaited<ReturnType<typeof dataService.accountYields.getDisplayPage>>
		>,
		readonly unknown[],
		string | undefined
	>({
		enabled: identity !== null && open && !statement.isPending,
		getNextPageParam: page => page.nextCursor ?? undefined,
		initialPageParam: undefined as string | undefined,
		placeholderData: previous => previous,
		queryFn: ({ pageParam }) =>
			dataService.accountYields.getDisplayPage(account.id, pageParam, yieldFilters),
		queryKey: [...queryKeys.accountYields.list(identity!, account.id), "statement", yieldFilters],
	});
	const yieldEntries = yields.data?.pages.flatMap(page => page.items) ?? [];
	const dailyEndingBalances = new Map(
		statement.data?.pages
			.flatMap(page => page.days)
			.map(day => [
				day.date,
				(day.accountEndingBalances ?? [])
					.filter(balance => balance.financialAccountId === account.id)
					.map(({ currency, amount }) => ({ amount, currency })),
			]) ?? [],
	);
	for (const entry of yieldEntries) {
		if (!dailyEndingBalances.has(entry.date) && entry.endingBalance !== undefined) {
			dailyEndingBalances.set(entry.date, [
				{ amount: entry.endingBalance, currency: entry.currency ?? account.currency ?? "BRL" },
			]);
		}
	}
	const displayName = getFinancialAccountDisplayName(account);
	const pendingActions = useModalRecoveryStore(state => state.pending);
	useBackgroundModalRecovery(`account-statement-delete:${account.id}`, () => onOpenChange(true));
	const removeTransaction = (transaction: Transaction) => {
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["yield"] },
			close: () => onOpenChange(false),
			conflictKey: `transaction:${transaction.id}`,
			failureMessage: "Não foi possível excluir transação.",
			loadingMessage: "Excluindo transação...",
			recovery: {
				entityId: transaction.id,
				kind: `account-statement-delete:${account.id}`,
				payload: transaction,
			},
			run: () => dataService.transactions.delete(transaction.id),
			successMessage: "Transação excluída.",
		});
		return Promise.resolve();
	};
	const removeYield = (entry: FinancialAccountYieldEntry) => {
		runBackgroundModalAction<unknown>({
			cache: { client: queryClient, operations: ["yield"] },
			close: () => onOpenChange(false),
			conflictKey: `yield:${entry.id}`,
			failureMessage: "Não foi possível excluir rendimento.",
			loadingMessage: "Excluindo rendimento...",
			recovery: { entityId: entry.id, kind: `account-statement-delete:${account.id}`, payload: entry },
			run: () =>
				entry.kind === "AUTOMATIC"
					? dataService.accountYields.upsertAutomatic({
							date: entry.date,
							financialAccountId: entry.financialAccountId,
							isExcluded: true,
						})
					: dataService.accountYields.delete(entry.id),
			successMessage: "Rendimento excluído.",
		});
		return Promise.resolve();
	};
	const editTransaction = (transaction: Transaction) => setEditingTransaction(transaction);

	return (
		<Dialog
			onOpenChange={onOpenChange}
			open={open}
			url={{
				clear: [`account.${account.id}.transactions.groups`],
				parameter: "statementAccountId",
				value: account.id,
			}}
		>
			<DialogContent className="gap-4 sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Extrato · {displayName}</DialogTitle>
					<DialogDescription>Movimentações que compõem saldo desta conta.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="space-y-5 pb-20">
						<TransactionsList
							canDeleteTransaction={transaction => !transaction.paymentCreditCardId}
							currencyCode={account.currency ?? "BRL"}
							dailyEndingBalances={dailyEndingBalances}
							hasMoreTransactions={statement.hasNextPage}
							hasMoreYields={yields.hasNextPage}
							isDeletingTransaction={transaction =>
								!!pendingActions[`${identity}:transaction:${transaction.id}`]
							}
							isDeletingYield={entry => !!pendingActions[`${identity}:yield:${entry.id}`]}
							isError={
								(statement.isError && !statement.data) || (yields.isError && !yields.data)
							}
							isFetchingMoreTransactions={statement.isFetchingNextPage}
							isFetchingMoreYields={yields.isFetchingNextPage}
							isPending={statement.isPending || yields.isPending}
							onDeleteTransaction={removeTransaction}
							onDeleteYield={removeYield}
							onEditTransaction={editTransaction}
							onEditYield={setEditingYield}
							onLoadMoreTransactions={statement.fetchNextPage}
							onLoadMoreYields={yields.fetchNextPage}
							onRetry={() => Promise.all([statement.refetch(), yields.refetch()])}
							refreshError={
								(statement.isError && !!statement.data) || (yields.isError && !!yields.data)
							}
							refreshPending={
								(statement.isFetching &&
									!statement.isPending &&
									!statement.isFetchingNextPage) ||
								(yields.isFetching && !yields.isPending && !yields.isFetchingNextPage)
							}
							transactions={statementItems}
							viewKey={`account.${account.id}.transactions`}
							yieldEntries={yieldEntries}
						/>
					</div>
					<CreateTransactionDialog
						account={account}
						onOpenChange={setCreatingTransaction}
						open={creatingTransaction}
					/>
					<EditTransactionDialog
						account={account}
						onOpenChange={nextOpen => !nextOpen && setEditingTransaction(null)}
						open={editingTransaction !== null}
						transaction={editingTransaction}
					/>
					<EditFinancialAccountYieldDialog
						entry={editingYield}
						onOpenChange={nextOpen => !nextOpen && setEditingYield(null)}
						open={editingYield !== null}
					/>
				</DialogBody>
				<ActionGroup className="absolute right-6 bottom-6 z-10">
					<FloatingActionMenu
						actions={[
							...(account.type !== "CREDIT_CARD" &&
							(account.type !== "REWARDS" || account.rewardsAccount?.kind === "CASHBACK")
								? [
										{
											icon: LuScale,
											label: "Ajustar saldo",
											onClick: () => setAdjustingBalance(true),
										},
									]
								: []),
							{
								icon: LuPlus,
								label: "Nova transação",
								onClick: () => setCreatingTransaction(true),
							},
						]}
					/>
				</ActionGroup>
				<BalanceAdjustmentsDialog
					account={account}
					onOpenChange={setAdjustingBalance}
					open={adjustingBalance}
				/>
			</DialogContent>
		</Dialog>
	);
}
