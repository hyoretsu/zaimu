import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { CreateTransactionDialog, EditTransactionDialog, TransactionsList } from "@/components/transactions";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { FinancialAccount, Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { type FinancialAccountYieldEntry, getFinancialAccountDisplayName } from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
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
			dataService.transactions.getDailyPage({ cursor: pageParam, financialAccountId: account.id, limit: 50 }),
		queryKey: queryKeys.transactions.byAccount(identity!, account.id),
	});
	const statementItems =
		statement.data?.pages.flatMap(page => page.days.flatMap(day => day.transactions)) ?? [];

	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [creatingTransaction, setCreatingTransaction] = useState(false);
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
		queryFn: ({ pageParam }) => dataService.accountYields.getDisplayPage(account.id, pageParam, yieldFilters),
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
	const refreshStatement = () => invalidateCacheOperation(queryClient, identity!, "yield");
	const removeTransaction = useMutation({
		mutationFn: (id: string) => dataService.transactions.delete(id),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível excluir a transação.", "negative"),
		onSuccess: async () => {
			await refreshStatement();
			showToast("Transação excluída.", "positive");
		},
	});
	const removeYield = useMutation({
		mutationFn: async (entry: FinancialAccountYieldEntry) => {
			if (entry.kind === "AUTOMATIC") {
				await dataService.accountYields.upsertAutomatic({
					date: entry.date,
					financialAccountId: entry.financialAccountId,
					isExcluded: true,
				});
				return;
			}
			await dataService.accountYields.delete(entry.id);
		},
		onError: error =>
			showToast(
				error instanceof Error ? error.message : "Não foi possível excluir o rendimento.",
				"negative",
			),
		onSuccess: async () => {
			await refreshStatement();
			showToast("Rendimento excluído.", "positive");
		},
	});
	const editTransaction = (transaction: Transaction) => setEditingTransaction(transaction);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="gap-4 sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Extrato · {displayName}</DialogTitle>
					<DialogDescription>Movimentações que compõem saldo desta conta.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<TransactionsList
						canDeleteTransaction={transaction => !transaction.paymentCreditCardId}
						currencyCode={account.currency ?? "BRL"}
						dailyEndingBalances={dailyEndingBalances}
						hasMoreTransactions={statement.hasNextPage}
						hasMoreYields={yields.hasNextPage}
						isDeletingTransaction={transaction =>
							removeTransaction.isPending && removeTransaction.variables === transaction.id
						}
						isDeletingYield={entry => removeYield.isPending && removeYield.variables?.id === entry.id}
						isError={(statement.isError && !statement.data) || (yields.isError && !yields.data)}
						isFetchingMoreTransactions={statement.isFetchingNextPage}
						isFetchingMoreYields={yields.isFetchingNextPage}
						isPending={statement.isPending || yields.isPending}
						onDeleteTransaction={transaction => removeTransaction.mutateAsync(transaction.id)}
						onDeleteYield={entry => removeYield.mutateAsync(entry)}
						onEditTransaction={editTransaction}
						onEditYield={setEditingYield}
						onLoadMoreTransactions={statement.fetchNextPage}
						onLoadMoreYields={yields.fetchNextPage}
						onRetry={() => Promise.all([statement.refetch(), yields.refetch()])}
						refreshError={(statement.isError && !!statement.data) || (yields.isError && !!yields.data)}
						refreshPending={
							(statement.isFetching && !statement.isPending && !statement.isFetchingNextPage) ||
							(yields.isFetching && !yields.isPending && !yields.isFetchingNextPage)
						}
						transactions={statementItems}
						yieldEntries={yieldEntries}
					/>
					<ActionGroup>
						<Button className="cursor-pointer" onClick={() => setCreatingTransaction(true)}>
							<LuPlus /> Nova transação
						</Button>
					</ActionGroup>
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
			</DialogContent>
		</Dialog>
	);
}
