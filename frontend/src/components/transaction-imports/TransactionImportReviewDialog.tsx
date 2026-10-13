import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LuCircleAlert, LuFileCheck2, LuLoaderCircle, LuTrash2 } from "react-icons/lu";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	DialogBody,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type {
	FinancialAccount,
	Transaction,
	TransactionImport,
	TransactionImportItem,
	TransactionImportTransferSuggestion,
} from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
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

type TransactionAccountDetails = Pick<FinancialAccount, "rewardsAccount" | "type" | "currency"> & {
	name: string;
};

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
		bookingCurrency:
			(item.type === "INCOME" || item.type === "YIELD"
				? destinationAccount?.currency
				: originAccount?.currency) ?? "BRL",
		createdAt: item.createdAt,
		creditCardName: item.creditCardName ?? undefined,
		creditCardStatementDate: item.creditCardStatementDate ?? undefined,
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
		paymentCreditCardId: item.paymentCreditCardId ?? undefined,
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
	importId: suppliedImportId,
	onOpenChange: suppliedOnOpenChange,
	open: suppliedOpen,
}: {
	importId: string | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [recoveryImportId, setRecoveryImportId] = useState<string | null>(null);
	const importId = recoveryImportId ?? suppliedImportId;
	const open = recoveryImportId !== null || suppliedOpen;
	const onOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setRecoveryImportId(null);
			setDiscardConfirmationOpen(false);
			setTransferSuggestionDecision(null);
		}
		suppliedOnOpenChange(nextOpen);
	};
	const pendingActions = useModalRecoveryStore(state => state.pending);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const reviewedImportId = useRef<string | null>(importId);
	const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(new Set());
	const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(new Set());
	const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
	const [recoveredEdit, setRecoveredEdit] = useState<
		Parameters<typeof dataService.transactionImports.updateItem>[2] | undefined
	>();
	useBackgroundModalRecovery<{
		importId: string;
		item: TransactionImportItem;
		data: Parameters<typeof dataService.transactionImports.updateItem>[2];
	}>("transaction-import-edit", entry => {
		setRecoveryImportId(entry.payload.importId);
		setRecoveredEdit(entry.payload.data);
		setEditingItem(entry.payload.item);
	});
	const [editingItem, setEditingItem] = useState<TransactionImportItem | null>(null);
	const [recoveredResolution, setRecoveredResolution] = useState<{
		duplicateId: string;
		sources: DuplicateResolutionSources;
	}>();
	useBackgroundModalRecovery<{
		importId: string;
		item: TransactionImportItem;
		duplicateId: string;
		sources: DuplicateResolutionSources;
	}>("transaction-import-reconcile", entry => {
		setRecoveryImportId(entry.payload.importId);
		setRecoveredResolution(entry.payload);
		setResolvingItem(entry.payload.item);
	});
	const [resolvingItem, setResolvingItem] = useState<TransactionImportItem | null>(null);
	const [transferSuggestionDecision, setTransferSuggestionDecision] = useState<{
		item: TransactionImportItem;
		suggestion: TransactionImportTransferSuggestion;
	} | null>(null);
	const transactionImport = useInfiniteQuery<
		TransactionImport,
		Error,
		InfiniteData<TransactionImport>,
		ReturnType<typeof queryKeys.transactionImports.detail>,
		string | undefined
	>({
		enabled: identity !== null && open && Boolean(importId),
		getNextPageParam: lastPage => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => dataService.transactionImports.get(importId!, pageParam),
		queryKey: queryKeys.transactionImports.detail(identity!, importId),
	});
	const transactionImportData = transactionImport.data?.pages[0];
	const items = transactionImport.data?.pages.flatMap(page => page.items) ?? [];
	const approvingItemIds = new Set(
		items
			.filter(
				item =>
					pendingActions[`${identity}:transaction-import:${importId}:${item.id}`] ||
					pendingActions[`${identity}:transaction-import-row:${item.id}`],
			)
			.map(item => item.id),
	);
	const approvingDateKeys = new Set(
		Object.keys(pendingActions)
			.filter(key => key.startsWith(`${identity}:transaction-import:${importId}:day:`))
			.map(key => key.split(":day:")[1]!),
	);
	const hasPendingItems =
		approvingItemIds.size > 0 ||
		Object.keys(pendingActions).some(key => key.startsWith(`${identity}:transaction-import:${importId}:`));
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

	const approve = useMutation({
		mutationFn: () => dataService.transactionImports.approve(getReviewedImportId()),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			const reviewFinished = result.finished;
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
	const approveItem = (itemId: string) => {
		const targetImportId = getReviewedImportId();
		runBackgroundModalAction({
			close: () => {},
			conflictKey: `transaction-import:${targetImportId}:${itemId}`,
			conflictKeys: [`transaction-import-row:${itemId}`],
			failureMessage: "Não foi possível aprovar transação.",
			loadingMessage: "Aprovando transação...",
			onSuccess: async result => {
				await invalidateCacheOperation(queryClient, identity!, "transaction");
				if (result.finished) {
					if (reviewedImportId.current === targetImportId) onOpenChange(false);
					await closeImportReview(queryClient, identity!, "transaction", targetImportId);
				} else await invalidate(targetImportId);
			},
			progress: "record",
			recovery: {
				entityId: itemId,
				kind: "transaction-import-action",
				payload: { importId: targetImportId },
			},
			run: () => dataService.transactionImports.approveItem(targetImportId, itemId),
			successMessage: "Transação aprovada.",
		});
	};
	const approveDay = (date: string) => {
		const targetImportId = getReviewedImportId();
		runBackgroundModalAction({
			close: () => {},
			conflictKey: `transaction-import:${targetImportId}:day:${date}`,
			conflictKeys: items
				.filter(item => item.date.slice(0, 10) === date)
				.flatMap(item => [
					`transaction-import:${targetImportId}:${item.id}`,
					`transaction-import-row:${item.id}`,
				]),
			failureMessage: "Não foi possível aprovar dia.",
			loadingMessage: "Aprovando dia...",
			onSuccess: async result => {
				await invalidateCacheOperation(queryClient, identity!, "transaction");
				if (result.finished) {
					if (reviewedImportId.current === targetImportId) onOpenChange(false);
					await closeImportReview(queryClient, identity!, "transaction", targetImportId);
				} else await invalidate(targetImportId);
			},
			progress: "record",
			recovery: { entityId: date, kind: "transaction-import-action", payload: { importId: targetImportId } },
			run: () => dataService.transactionImports.approveDay(targetImportId, date),
			successMessage: "Transações do dia aprovadas.",
		});
	};
	useBackgroundModalRecovery<{ importId: string }>("transaction-import-action", entry =>
		setRecoveryImportId(entry.payload.importId),
	);
	const discardImport = () => {
		if (!importId) return;
		const targetImportId = importId;
		runBackgroundModalAction({
			close: () => {
				setDiscardConfirmationOpen(false);
				onOpenChange(false);
			},
			conflictKey: `transaction-import:${targetImportId}:batch`,
			failureMessage: "Não foi possível excluir o lote.",
			loadingMessage: "Excluindo lote...",
			onSuccess: () => closeImportReview(queryClient, identity!, "transaction", targetImportId),
			progress: "toast",
			recovery: {
				entityId: targetImportId,
				kind: "transaction-import-discard",
				payload: { importId: targetImportId },
			},
			run: () => dataService.transactionImports.delete(targetImportId),
			successMessage: "Importação descartada.",
		});
	};
	const discardPending = Boolean(pendingActions[`${identity}:transaction-import:${importId}:batch`]);
	useBackgroundModalRecovery<{ importId: string }>("transaction-import-discard", entry => {
		setRecoveryImportId(entry.payload.importId);
		setDiscardConfirmationOpen(true);
	});

	useBackgroundModalRecovery<{
		importId: string;
		item: TransactionImportItem;
		suggestion: TransactionImportTransferSuggestion;
	}>("transaction-import-transfer", entry => {
		setRecoveryImportId(entry.payload.importId);
		setTransferSuggestionDecision({ item: entry.payload.item, suggestion: entry.payload.suggestion });
	});
	const decideTransfer = (accept: boolean) => {
		if (!transferSuggestionDecision) return;
		const { item, suggestion } = transferSuggestionDecision;
		const targetImportId = getReviewedImportId();
		runBackgroundModalAction({
			close: () => setTransferSuggestionDecision(null),
			conflictKey: `transaction-import:${targetImportId}:${item.id}`,
			conflictKeys: [`transaction-import-row:${item.id}`, `transaction-import-row:${suggestion.id}`],
			failureMessage: "Não foi possível decidir transferência.",
			loadingMessage: "Processando transferência...",
			onSuccess: async result => {
				if (result?.removedImportId === targetImportId) {
					if (reviewedImportId.current === targetImportId) onOpenChange(false);
					await closeImportReview(queryClient, identity!, "transaction", targetImportId);
				} else await invalidate(targetImportId);
			},
			progress: "record",
			recovery: {
				entityId: item.id,
				kind: "transaction-import-transfer",
				payload: { importId: targetImportId, item, suggestion },
			},
			run: async () => {
				if (accept)
					return dataService.transactionImports.acceptTransferSuggestion(
						targetImportId,
						item.id,
						suggestion.id,
					);
				await dataService.transactionImports.rejectTransferSuggestion(targetImportId, item.id, suggestion.id);
				return null;
			},
			successMessage: accept
				? "Movimentos combinados como transferência."
				: "Este par não será sugerido novamente.",
		});
	};
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
				currency: account.currency,
				name: account.name || account.institution?.name || "Conta sem nome",
				rewardsAccount: account.rewardsAccount,
				type: account.type,
			},
		]),
	);
	const remainingItemCount = transactionImportData?.pendingItemCount ?? 0;
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
		const targetImportId = getReviewedImportId();
		runBackgroundModalAction({
			close: () => {
				setResolvingItem(null);
				setRecoveredResolution(undefined);
			},
			conflictKey: `transaction-import:${targetImportId}:${item.id}`,
			conflictKeys: [`transaction-import-row:${item.id}`],
			failureMessage: "Não foi possível conciliar a transação.",
			loadingMessage: "Conciliando transação...",
			onSuccess: () => invalidate(targetImportId),
			progress: "record",
			recovery: {
				entityId: item.id,
				kind: "transaction-import-reconcile",
				payload: { duplicateId: duplicate.id, importId: targetImportId, item, sources },
			},
			run: () =>
				dataService.transactionImports.reconcileItem(targetImportId, item.id, {
					duplicateId: duplicate.id,
					duplicateSource: duplicate.source,
					sources,
				}),
			successMessage: "Transação conciliada. Aprove-a para atualizar o registro existente.",
		});
	};
	const ignoreDuplicate = (item: TransactionImportItem) => {
		const targetImportId = getReviewedImportId();
		runBackgroundModalAction({
			close: () => {},
			conflictKey: `transaction-import:${targetImportId}:${item.id}`,
			conflictKeys: [`transaction-import-row:${item.id}`],
			failureMessage: "Não foi possível ignorar alerta.",
			loadingMessage: "Ignorando alerta...",
			onSuccess: () => invalidate(targetImportId),
			progress: "record",
			recovery: {
				entityId: item.id,
				kind: "transaction-import-action",
				payload: { importId: targetImportId },
			},
			run: () =>
				dataService.transactionImports.updateItem(targetImportId, item.id, { isDuplicateIgnored: true }),
			successMessage: "Alerta de possível duplicata ignorado.",
		});
	};

	return (
		<>
			<ImportDialog
				childDialogOpen={Boolean(
					discardConfirmationOpen || editingItem || resolvingItem || transferSuggestionDecision,
				)}
				onOpenChange={onOpenChange}
				open={open}
			>
				<ImportDialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Revisar extrato importado</DialogTitle>
						<DialogDescription>
							{transactionImportData
								? `${transactionImportData.fileName} · ${remainingItemCountLabel}. Apenas transações aprovadas serão registradas; as demais permanecerão no extrato.`
								: "Carregando transações do extrato…"}
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						{transactionImport.isPending || accounts.isPending ? (
							<div className="space-y-3">
								{[1, 2, 3].map(item => (
									<Skeleton className="h-24 rounded-2xl" key={item} />
								))}
							</div>
						) : (transactionImport.isError && !transactionImport.data) || accounts.isError ? (
							<EmptyState
								description="Tente novamente em instantes."
								icon={<LuCircleAlert className="size-7" />}
								title="Não foi possível carregar o extrato"
							/>
						) : transactionImportData ? (
							<div className="">
								<div className="space-y-5">
									{Object.entries(
										sortTransactionsByMostRecent(items).reduce<Record<string, TransactionImportItem[]>>(
											(groups, item) => {
												const date = item.date.slice(0, 10);
												const itemsForDate = groups[date] ?? [];
												itemsForDate.push(item);
												groups[date] = itemsForDate;
												return groups;
											},
											{},
										),
									).map(([date, items]) => (
										<ImportReviewDateSection
											approveAllDisabled={
												approve.isPending ||
												discardPending ||
												items.some(item => approvingItemIds.has(item.id)) ||
												approvingDateKeys.has(date) ||
												!items.some(item => !item.duplicateReason)
											}
											approveAllPending={approvingDateKeys.has(date)}
											collapsed={collapsedDateKeys.has(date)}
											dateLabel={formatLocalDate(date)}
											itemCount={items.length}
											key={date}
											onApproveAll={() => approveDay(date)}
											onCollapsedChange={collapsed => setDateCollapsed(date, collapsed)}
										>
											{items.map(item => (
												<ImportReviewTransactionItem
													accountNames={accountNames}
													collapsed={collapsedItemIds.has(item.id)}
													disabled={
														approve.isPending ||
														discardPending ||
														approvingItemIds.has(item.id) ||
														approvingDateKeys.has(date) ||
														Boolean(
															pendingActions[`${identity}:transaction-import:${importId}:${item.id}`] ||
																pendingActions[`${identity}:transaction-import-row:${item.id}`],
														)
													}
													isIgnoringDuplicate={false}
													item={item}
													key={item.id}
													onApprove={() => approveItem(item.id)}
													onCollapsedChange={collapsed => setItemCollapsed(item.id, collapsed)}
													onEdit={() => setEditingItem(item)}
													onIgnoreDuplicate={() => ignoreDuplicate(item)}
													onResolveDuplicate={() => setResolvingItem(item)}
													onViewTransferSuggestion={suggestion =>
														setTransferSuggestionDecision({ item, suggestion })
													}
													pending={Boolean(
														pendingActions[`${identity}:transaction-import:${importId}:${item.id}`] ||
															pendingActions[`${identity}:transaction-import-row:${item.id}`],
													)}
													transaction={toTransaction(item, accountDetails)}
												/>
											))}
										</ImportReviewDateSection>
									))}
									{transactionImport.hasNextPage && (
										<ActionGroup>
											<Button
												className="cursor-pointer disabled:cursor-not-allowed"
												disabled={transactionImport.isFetchingNextPage}
												onClick={() => transactionImport.fetchNextPage()}
												variant="outline"
											>
												{transactionImport.isFetchingNextPage
													? "Carregando..."
													: transactionImport.isFetchNextPageError
														? "Tentar novamente"
														: "Carregar mais"}
											</Button>
										</ActionGroup>
									)}
								</div>
							</div>
						) : null}
					</DialogBody>
					<DialogFooter className="flex-row justify-end">
						<Button
							className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/80 disabled:cursor-not-allowed"
							disabled={
								discardPending ||
								approve.isPending ||
								hasPendingItems ||
								approvingItemIds.size > 0 ||
								approvingDateKeys.size > 0
							}
							onClick={() => setDiscardConfirmationOpen(true)}
						>
							<LuTrash2 />
							<span>
								Descartar<span className="hidden sm:inline"> extrato</span>
							</span>
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={
								approve.isPending ||
								hasPendingItems ||
								approvingItemIds.size > 0 ||
								approvingDateKeys.size > 0 ||
								discardPending
							}
							onClick={finishImport}
						>
							{approve.isPending ? <LuLoaderCircle className="animate-spin" /> : <LuFileCheck2 />}
							{approve.isPending ? (
								"Finalizando…"
							) : (
								<span>
									Finalizar<span className="hidden sm:inline"> revisão</span>
								</span>
							)}
						</Button>
					</DialogFooter>
				</ImportDialogContent>
			</ImportDialog>
			<ImportDialog onOpenChange={setDiscardConfirmationOpen} open={discardConfirmationOpen}>
				<ImportDialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Excluir extrato importado?</DialogTitle>
						<DialogDescription>
							Esta ação excluirá todas as transações deste extrato e não poderá ser desfeita.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={discardPending}
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
							disabled={discardPending}
							onClick={() => discardImport()}
						>
							<LuTrash2 /> {discardPending ? "Excluindo extrato…" : "Excluir extrato"}
						</Button>
					</DialogFooter>
				</ImportDialogContent>
			</ImportDialog>
			<EditImportedTransactionDialog
				accounts={accounts.data ?? []}
				initialData={recoveredEdit}
				item={editingItem}
				onOpenChange={nextOpen => {
					if (!nextOpen) {
						setEditingItem(null);
						setRecoveredEdit(undefined);
					}
				}}
				onSubmit={async data => {
					if (!editingItem || !importId) return;
					const item = editingItem;
					const targetImportId = importId;
					runBackgroundModalAction({
						close: () => {
							setEditingItem(null);
							setRecoveredEdit(undefined);
						},
						conflictKey: `transaction-import:${targetImportId}:${item.id}`,
						conflictKeys: [`transaction-import-row:${item.id}`],
						failureMessage: "Não foi possível salvar o item.",
						loadingMessage: "Salvando item importado...",
						onSuccess: () => invalidate(targetImportId),
						progress: "record",
						recovery: {
							entityId: item.id,
							kind: "transaction-import-edit",
							payload: { data, importId: targetImportId, item },
						},
						run: () => dataService.transactionImports.updateItem(targetImportId, item.id, data),
						successMessage: "Item importado atualizado.",
					});
				}}
				open={editingItem !== null}
				pending={false}
			/>
			<DuplicateResolutionDialog
				accountCurrencies={
					new Map((accounts.data ?? []).map(account => [account.id, account.currency ?? "BRL"]))
				}
				accountNames={accountNames}
				initialSelection={recoveredResolution}
				item={resolvingItem}
				onOpenChange={nextOpen => {
					if (!nextOpen) {
						setResolvingItem(null);
						setRecoveredResolution(undefined);
					}
				}}
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
				onAccept={() => decideTransfer(true)}
				onOpenChange={nextOpen => !nextOpen && setTransferSuggestionDecision(null)}
				onReject={() => decideTransfer(false)}
				open={transferSuggestionDecision !== null}
				pending={
					!!transferSuggestionDecision &&
					[transferSuggestionDecision.item.id, transferSuggestionDecision.suggestion.id].some(
						id => !!pendingActions[`${identity}:transaction-import-row:${id}`],
					)
				}
			/>
		</>
	);
}
