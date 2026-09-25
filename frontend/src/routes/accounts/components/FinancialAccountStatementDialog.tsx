import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuLandmark, LuPlus } from "react-icons/lu";
import {
	CreateTransactionDialog,
	EditTransactionDialog,
	TransactionListItem,
} from "@/components/transactions";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialAccount, Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalTime } from "@/lib/date";
import {
	calculateFinancialAccountYieldEntries,
	type FinancialAccountYieldEntry,
	getFinancialAccountDisplayName,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { EditFinancialAccountYieldDialog } from "./EditFinancialAccountYieldDialog";
import { FinancialAccountYieldStatementItem } from "./FinancialAccountYieldStatementItem";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

function groupStatementByDate(transactions: Transaction[], yields: FinancialAccountYieldEntry[]) {
	const groups: Record<
		string,
		Array<{ kind: "transaction"; value: Transaction } | { kind: "yield"; value: FinancialAccountYieldEntry }>
	> = {};
	for (const transaction of transactions) {
		const date = transaction.date.slice(0, 10);
		const entries = groups[date] ?? [];
		entries.push({ kind: "transaction", value: transaction });
		groups[date] = entries;
	}
	for (const entry of yields) {
		const entries = groups[entry.date] ?? [];
		entries.push({ kind: "yield", value: entry });
		groups[entry.date] = entries;
	}
	for (const entries of Object.values(groups))
		entries.sort((left, right) =>
			(formatLocalTime(right.value.time) ?? "").localeCompare(formatLocalTime(left.value.time) ?? ""),
		);
	return groups;
}

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
	const statement = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.transactions.getAll({ financialAccountId: account.id }),
		queryKey: queryKeys.transactions.byAccount(identity!, account.id),
	});
	const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
	const [creatingTransaction, setCreatingTransaction] = useState(false);
	const [editingYield, setEditingYield] = useState<FinancialAccountYieldEntry | null>(null);
	const holidays = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accountYieldHolidays.getAll(),
		queryKey: queryKeys.accountYieldHolidays.all(identity!),
	});
	const yields = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.accountYields.getAll(account.id),
		queryKey: queryKeys.accountYields.list(identity!, account.id),
	});
	const yieldEntries = calculateFinancialAccountYieldEntries(
		account,
		statement.data ?? [],
		holidays.data?.map(holiday => holiday.date) ?? [],
		undefined,
		yields.data ?? [],
	);
	const groupedEntries = groupStatementByDate(statement.data ?? [], yieldEntries);
	const dates = Object.keys(groupedEntries).toSorted((left, right) => right.localeCompare(left));
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
			<DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Extrato · {displayName}</DialogTitle>
					<DialogDescription>Movimentações que compõem saldo desta conta.</DialogDescription>
				</DialogHeader>
				{statement.isPending || holidays.isPending || yields.isPending ? (
					<div className="space-y-3">
						{[1, 2, 3].map(item => (
							<Skeleton className="h-24 rounded-2xl" key={item} />
						))}
					</div>
				) : statement.isError || holidays.isError || yields.isError ? (
					<EmptyState
						description="Tente novamente em instantes."
						icon={<LuLandmark className="size-7" />}
						title="Não foi possível carregar extrato"
					/>
				) : dates.length ? (
					<ScrollArea className="min-h-0 pr-3">
						<div className="space-y-5">
							{dates.map(date => (
								<section className="space-y-2" key={date}>
									<h3 className="font-medium text-muted-foreground text-sm">
										{dateFormatter.format(new Date(`${date}T12:00:00`))}
									</h3>
									<div className="divide-y rounded-2xl border bg-card shadow-sm">
										{groupedEntries[date]?.map(item => {
											if (item.kind === "yield") {
												const entry = item.value;
												return (
													<FinancialAccountYieldStatementItem
														amount={entry.amount}
														deleting={removeYield.isPending && removeYield.variables?.id === entry.id}
														key={`yield-${entry.id}`}
														onDelete={() => removeYield.mutateAsync(entry)}
														onEdit={() => setEditingYield(entry)}
														time={entry.time}
													/>
												);
											}
											const transaction = item.value;
											return (
												<TransactionListItem
													deleting={
														removeTransaction.isPending && removeTransaction.variables === transaction.id
													}
													key={transaction.id}
													metadataPrefix={
														formatLocalTime(transaction.time) ? (
															<span className="text-muted-foreground text-xs">
																{formatLocalTime(transaction.time)}
															</span>
														) : undefined
													}
													onDelete={
														transaction.creditCardStatementId
															? undefined
															: () => removeTransaction.mutateAsync(transaction.id)
													}
													onEdit={() => editTransaction(transaction)}
													transaction={transaction}
												/>
											);
										})}
									</div>
								</section>
							))}
						</div>
					</ScrollArea>
				) : (
					<EmptyState
						description="Nenhuma entrada, saída ou transferência vinculada a esta conta."
						icon={<LuLandmark className="size-7" />}
						title="Extrato vazio"
					/>
				)}
				<Button className="w-full cursor-pointer" onClick={() => setCreatingTransaction(true)}>
					<LuPlus /> Nova transação
				</Button>
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
			</DialogContent>
		</Dialog>
	);
}
