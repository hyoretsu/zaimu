import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LuCircleAlert, LuFileCheck2, LuLoaderCircle, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
	FinancialAccount,
	Transaction,
	TransactionImportItem,
	TransactionImportTransferSuggestion,
} from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import {
	closeImportReview,
	invalidateCacheOperation,
	invalidateQueryKeys,
	queryKeys,
	useCacheIdentity,
} from "@/lib/query-cache";
import { sortTransactionsByMostRecent } from "@/lib/transaction-sort";
import { showToast } from "@/stores";
import { DuplicateResolutionDialog, type DuplicateResolutionSources } from "./DuplicateResolutionDialog";
import { EditImportedTransactionDialog } from "./EditImportedTransactionDialog";
import { ImportReviewDateSection } from "./ImportReviewDateSection";
import { ImportReviewTransactionItem } from "./ImportReviewTransactionItem";
import { TransferSuggestionDecisionDialog } from "./TransferSuggestionDecisionDialog";

type TransactionAccountDetails = Pick<FinancialAccount, "rewardsAccount" | "type"> & { name: string };

function toTransaction(
	item: TransactionImportItem,
	accounts: Map<string, TransactionAccountDetails>,
): Transaction {
	const originName = item.originFinancialAccountId
		? accounts.get(item.originFinancialAccountId)?.name
		: undefined;
	const destinationName = item.destinationFinancialAccountId
		? accounts.get(item.destinationFinancialAccountId)?.name
		: undefined;
	const originAccount = item.originFinancialAccountId
		? accounts.get(item.originFinancialAccountId)
		: undefined;
	const destinationAccount = item.destinationFinancialAccountId
		? accounts.get(item.destinationFinancialAccountId)
		: undefined;
	return {
		amount: item.amount,
		createdAt: item.createdAt,
		creditCardName: item.creditCardName ?? undefined,
		creditCardStatementDate: item.creditCardStatementDate ?? undefined,
		creditCardStatementId: item.creditCardStatementId ?? undefined,
		date: item.date,
		debtSplit: item.debtSplit,
		description: item.description ?? undefined,
		destinationAccountRewardsKind: destinationAccount?.rewardsAccount?.kind,
		destinationAccountType: destinationAccount?.type,
		destinationFinancialAccountId: item.destinationFinancialAccountId,
		destinationName,
		id: item.id,
		isHidden: item.isHidden,
		originAccountRewardsKind: originAccount?.rewardsAccount?.kind,
		originAccountType: originAccount?.type,
		originFinancialAccountId: item.originFinancialAccountId,
		originName,
		source: "FINANCIAL_ACCOUNT",
		sourceName: item.type === "INCOME" ? destinationName : originName,
		storeName: item.storeName,
		tagIds: item.tagIds,
		tags: item.tags,
		time: item.time,
		type: item.type === "YIELD" ? "INCOME" : item.type,
	};
}

function toTransferSuggestionTransaction(
	suggestion: TransactionImportTransferSuggestion,
	accounts: Map<string, TransactionAccountDetails>,
): Transaction {
	const type = suggestion.type === "YIELD" ? "INCOME" : suggestion.type;
	const originFinancialAccountId =
		suggestion.originFinancialAccountId ?? (type === "EXPENSE" ? suggestion.financialAccountId : null);
	const destinationFinancialAccountId =
		suggestion.destinationFinancialAccountId ?? (type === "INCOME" ? suggestion.financialAccountId : null);
	const originAccount = originFinancialAccountId ? accounts.get(originFinancialAccountId) : undefined;
	const destinationAccount = destinationFinancialAccountId
		? accounts.get(destinationFinancialAccountId)
		: undefined;
	const originName = originAccount?.name;
	const destinationName = destinationFinancialAccountId ? destinationAccount?.name : undefined;
	return {
		amount: suggestion.amount,
		categoryColor: suggestion.categoryColor ?? undefined,
		categoryId: suggestion.categoryId ?? undefined,
		categoryName: suggestion.categoryName ?? undefined,
		createdAt: suggestion.createdAt,
		date: suggestion.date,
		debtSplit: suggestion.debtSplit,
		description: suggestion.description ?? undefined,
		destinationAccountRewardsKind: destinationAccount?.rewardsAccount?.kind,
		destinationAccountType: destinationAccount?.type,
		destinationFinancialAccountId,
		destinationName,
		id: suggestion.id,
		isHidden: suggestion.isHidden,
		isSynced: true,
		originAccountRewardsKind: originAccount?.rewardsAccount?.kind,
		originAccountType: originAccount?.type,
		originFinancialAccountId,
		originName,
		source: "FINANCIAL_ACCOUNT",
		sourceName: type === "INCOME" ? destinationName : originName,
		storeName: suggestion.storeName,
		tagIds: suggestion.tagIds,
		tags: suggestion.tags,
		time: suggestion.time,
		type,
	};
}

export function TransactionImportReviewDialog({
	importId,
	onOpenChange,
	open,
}: {
	importId: string | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const reviewedImportId = useRef<string | null>(importId);
	const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(new Set());
	const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(new Set());
	const [approvingDateKeys, setApprovingDateKeys] = useState<Set<string>>(new Set());
	const [approvingItemIds, setApprovingItemIds] = useState<Set<string>>(new Set());
	const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<TransactionImportItem | null>(null);
	const [resolvingItem, setResolvingItem] = useState<TransactionImportItem | null>(null);
	const [transferSuggestionDecision, setTransferSuggestionDecision] = useState<{
		item: TransactionImportItem;
		suggestion: TransactionImportTransferSuggestion;
	} | null>(null);
	const transactionImport = useQuery({
		enabled: identity !== null && open && Boolean(importId),
		queryFn: () => dataService.transactionImports.get(importId!),
		queryKey: queryKeys.transactionImports.detail(identity!, importId),
	});
	useEffect(() => {
		if (importId) reviewedImportId.current = importId;
	}, [importId]);
	const getReviewedImportId = () => {
		if (!reviewedImportId.current) throw new Error("Importação não encontrada");
		return reviewedImportId.current;
	};
	const accounts = useQuery({
		enabled: identity !== null && open,
		queryFn: dataService.accounts.getAll,
		queryKey: queryKeys.accounts.list(identity!),
	});
	useEffect(() => {
		if (!open) return;
		setCollapsedDateKeys(new Set());
		setCollapsedItemIds(new Set());
		setApprovingDateKeys(new Set());
		setApprovingItemIds(new Set());
		setDiscardConfirmationOpen(false);
		setTransferSuggestionDecision(null);
	}, [importId, open]);
	const invalidate = (targetImportId = getReviewedImportId()) =>
		invalidateQueryKeys(queryClient, [
			queryKeys.transactionImports.pending(identity!),
			queryKeys.transactionImports.detail(identity!, targetImportId),
		]);
	const closeFinishedReview = async () => {
		const targetImportId = getReviewedImportId();
		onOpenChange(false);
		await closeImportReview(queryClient, identity!, "transaction", targetImportId);
	};
	const updateItem = useMutation({
		mutationFn: ({
			item,
			data,
		}: {
			item: TransactionImportItem;
			data: Parameters<typeof dataService.transactionImports.updateItem>[2];
		}) => dataService.transactionImports.updateItem(getReviewedImportId(), item.id, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setEditingItem(null);
			await invalidate();
			showToast("Transação importada atualizada.", "positive");
		},
	});
	const acceptTransferSuggestion = useMutation({
		mutationFn: ({ counterpartItemId, itemId }: { counterpartItemId: string; itemId: string }) =>
			dataService.transactionImports.acceptTransferSuggestion(
				getReviewedImportId(),
				itemId,
				counterpartItemId,
			),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			await invalidate();
			if (result.removedImportId === getReviewedImportId()) await closeFinishedReview();
			showToast("Movimentos combinados como transferência.", "positive");
		},
	});
	const approve = useMutation({
		mutationFn: () => dataService.transactionImports.approve(getReviewedImportId()),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			const reviewFinished = result.created === remainingItemCount;
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			if (reviewFinished) await closeFinishedReview();
			else await invalidate();
			showToast(
				reviewFinished
					? "Revisão finalizada."
					: `${result.created} ${result.created === 1 ? "transação aprovada" : "transações aprovadas"}. Revise as pendências restantes.`,
				"positive",
			);
		},
	});
	const approveItem = useMutation({
		mutationFn: (itemId: string) => dataService.transactionImports.approveItem(getReviewedImportId(), itemId),
		onError: error => showToast(error.message, "negative"),
		onMutate: itemId => {
			setApprovingItemIds(current => new Set(current).add(itemId));
		},
		onSettled: (_data, _error, itemId) => {
			setApprovingItemIds(current => {
				const next = new Set(current);
				next.delete(itemId);
				return next;
			});
		},
		onSuccess: async () => {
			const reviewFinished = remainingItemCount === 1;
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			if (reviewFinished) await closeFinishedReview();
			else await invalidate();
			showToast(reviewFinished ? "Revisão finalizada." : "Transação aprovada.", "positive");
		},
	});
	const approveDay = useMutation({
		mutationFn: (date: string) => dataService.transactionImports.approveDay(getReviewedImportId(), date),
		onError: error => showToast(error.message, "negative"),
		onMutate: date => {
			setApprovingDateKeys(current => new Set(current).add(date));
		},
		onSettled: (_data, _error, date) => {
			setApprovingDateKeys(current => {
				const next = new Set(current);
				next.delete(date);
				return next;
			});
		},
		onSuccess: async result => {
			const reviewFinished = result.created === remainingItemCount;
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			if (reviewFinished) await closeFinishedReview();
			else await invalidate();
			showToast(
				reviewFinished
					? "Revisão finalizada."
					: `${result.created} ${result.created === 1 ? "transação aprovada" : "transações aprovadas"}.`,
				"positive",
			);
		},
	});
	const discard = useMutation({
		mutationFn: () => dataService.transactionImports.delete(getReviewedImportId()),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setDiscardConfirmationOpen(false);
			await closeFinishedReview();
			showToast("Extrato descartado.", "info");
		},
	});
	const rejectTransferSuggestion = useMutation({
		mutationFn: ({ counterpartItemId, itemId }: { counterpartItemId: string; itemId: string }) =>
			dataService.transactionImports.rejectTransferSuggestion(
				getReviewedImportId(),
				itemId,
				counterpartItemId,
			),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidate();
			showToast("Este par não será sugerido novamente.", "info");
		},
	});
	const accountNames = new Map(
		(accounts.data ?? []).map(account => [
			account.id,
			account.name || account.institution?.name || "Conta sem nome",
		]),
	);
	const accountDetails = new Map(
		(accounts.data ?? []).map(account => [
			account.id,
			{
				name: account.name || account.institution?.name || "Conta sem nome",
				rewardsAccount: account.rewardsAccount,
				type: account.type,
			},
		]),
	);
	const remainingItemCount = transactionImport.data?.items.length ?? 0;
	const remainingItemCountLabel = `${remainingItemCount} ${remainingItemCount === 1 ? "transação restante" : "transações restantes"}`;
	const setDateCollapsed = (date: string, collapsed: boolean) => {
		setCollapsedDateKeys(current => {
			const next = new Set(current);
			if (collapsed) next.add(date);
			else next.delete(date);
			return next;
		});
	};
	const setItemCollapsed = (itemId: string, collapsed: boolean) => {
		setCollapsedItemIds(current => {
			const next = new Set(current);
			if (collapsed) next.add(itemId);
			else next.delete(itemId);
			return next;
		});
	};
	const finishImport = () => {
		approve.mutate();
	};
	const resolveDuplicate = async (
		item: TransactionImportItem,
		duplicate: TransactionImportItem["duplicates"][number],
		sources: DuplicateResolutionSources,
	) => {
		const reconciledImport = await dataService.transactionImports.reconcileItem(
			getReviewedImportId(),
			item.id,
			{
				duplicateId: duplicate.id,
				duplicateSource: duplicate.source,
				sources,
			},
		);
		setResolvingItem(null);
		await Promise.all([invalidate()]);
		showToast("Transação importada conciliada. Aprove-a para atualizar o registro existente.", "positive");
	};

	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open}>
				<DialogContent
					className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl"
					onInteractOutside={event => {
						if (discardConfirmationOpen || editingItem || resolvingItem || transferSuggestionDecision)
							event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>Revisar extrato importado</DialogTitle>
						<DialogDescription>
							{transactionImport.data
								? `${transactionImport.data.fileName} · ${remainingItemCountLabel}. Apenas transações aprovadas serão registradas; as demais permanecerão no extrato.`
								: "Carregando transações do extrato…"}
						</DialogDescription>
					</DialogHeader>
					{transactionImport.isPending || accounts.isPending ? (
						<div className="space-y-3">
							{[1, 2, 3].map(item => (
								<Skeleton className="h-24 rounded-2xl" key={item} />
							))}
						</div>
					) : transactionImport.isError || accounts.isError ? (
						<EmptyState
							description="Tente novamente em instantes."
							icon={<LuCircleAlert className="size-7" />}
							title="Não foi possível carregar o extrato"
						/>
					) : transactionImport.data ? (
						<ScrollArea className="min-h-0 pr-3">
							<div className="space-y-5">
								{Object.entries(
									sortTransactionsByMostRecent(transactionImport.data.items).reduce<
										Record<string, TransactionImportItem[]>
									>((groups, item) => {
										const date = item.date.slice(0, 10);
										const itemsForDate = groups[date] ?? [];
										itemsForDate.push(item);
										groups[date] = itemsForDate;
										return groups;
									}, {}),
								).map(([date, items]) => (
									<ImportReviewDateSection
										approveAllDisabled={
											updateItem.isPending ||
											approve.isPending ||
											discard.isPending ||
											items.some(item => approvingItemIds.has(item.id)) ||
											approvingDateKeys.size > 0 ||
											!items.some(item => !item.duplicateReason)
										}
										approveAllPending={approvingDateKeys.has(date)}
										collapsed={collapsedDateKeys.has(date)}
										dateLabel={formatLocalDate(date)}
										itemCount={items.length}
										key={date}
										onApproveAll={() => approveDay.mutate(date)}
										onCollapsedChange={collapsed => setDateCollapsed(date, collapsed)}
									>
										{items.map(item => (
											<ImportReviewTransactionItem
												accountNames={accountNames}
												collapsed={collapsedItemIds.has(item.id)}
												disabled={
													updateItem.isPending ||
													acceptTransferSuggestion.isPending ||
													rejectTransferSuggestion.isPending ||
													approvingItemIds.has(item.id) ||
													approvingDateKeys.has(date)
												}
												item={item}
												key={item.id}
												onApprove={() => approveItem.mutate(item.id)}
												onCollapsedChange={collapsed => setItemCollapsed(item.id, collapsed)}
												onEdit={() => setEditingItem(item)}
												onResolveDuplicate={() => setResolvingItem(item)}
												onViewTransferSuggestion={suggestion =>
													setTransferSuggestionDecision({ item, suggestion })
												}
												transaction={toTransaction(item, accountDetails)}
											/>
										))}
									</ImportReviewDateSection>
								))}
							</div>
						</ScrollArea>
					) : null}
					<DialogFooter className="flex-row justify-end">
						<Button
							className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/80 disabled:cursor-not-allowed"
							disabled={
								discard.isPending ||
								approve.isPending ||
								approvingItemIds.size > 0 ||
								approvingDateKeys.size > 0
							}
							onClick={() => setDiscardConfirmationOpen(true)}
						>
							<LuTrash2 /> Descartar extrato
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={
								approve.isPending ||
								approvingItemIds.size > 0 ||
								approvingDateKeys.size > 0 ||
								discard.isPending
							}
							onClick={finishImport}
						>
							{approve.isPending ? <LuLoaderCircle className="animate-spin" /> : <LuFileCheck2 />}
							{approve.isPending ? "Finalizando…" : "Finalizar revisão"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog onOpenChange={setDiscardConfirmationOpen} open={discardConfirmationOpen}>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Excluir extrato importado?</DialogTitle>
						<DialogDescription>
							Esta ação excluirá todas as transações deste extrato e não poderá ser desfeita.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={discard.isPending}
							onClick={() => {
								setDiscardConfirmationOpen(false);
								onOpenChange(false);
							}}
							variant="outline"
						>
							Fechar modal
						</Button>
						<Button
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
							disabled={discard.isPending}
							onClick={() => discard.mutate()}
						>
							<LuTrash2 /> {discard.isPending ? "Excluindo extrato…" : "Excluir extrato"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<EditImportedTransactionDialog
				accounts={accounts.data ?? []}
				item={editingItem}
				onOpenChange={nextOpen => !nextOpen && setEditingItem(null)}
				onSubmit={async data => {
					if (!editingItem) return;
					await updateItem.mutateAsync({ data, item: editingItem });
				}}
				open={editingItem !== null}
				pending={updateItem.isPending}
			/>
			<DuplicateResolutionDialog
				accountNames={accountNames}
				item={resolvingItem}
				onOpenChange={nextOpen => !nextOpen && setResolvingItem(null)}
				onResolve={resolveDuplicate}
				open={resolvingItem !== null}
			/>
			<TransferSuggestionDecisionDialog
				counterpartTransaction={
					transferSuggestionDecision
						? toTransferSuggestionTransaction(transferSuggestionDecision.suggestion, accountDetails)
						: null
				}
				currentTransaction={
					transferSuggestionDecision ? toTransaction(transferSuggestionDecision.item, accountDetails) : null
				}
				onAccept={() => {
					if (!transferSuggestionDecision) return;
					acceptTransferSuggestion.mutate({
						counterpartItemId: transferSuggestionDecision.suggestion.id,
						itemId: transferSuggestionDecision.item.id,
					});
					setTransferSuggestionDecision(null);
				}}
				onOpenChange={nextOpen => !nextOpen && setTransferSuggestionDecision(null)}
				onReject={() => {
					if (!transferSuggestionDecision) return;
					rejectTransferSuggestion.mutate({
						counterpartItemId: transferSuggestionDecision.suggestion.id,
						itemId: transferSuggestionDecision.item.id,
					});
					setTransferSuggestionDecision(null);
				}}
				open={transferSuggestionDecision !== null}
				pending={acceptTransferSuggestion.isPending || rejectTransferSuggestion.isPending}
			/>
		</>
	);
}
