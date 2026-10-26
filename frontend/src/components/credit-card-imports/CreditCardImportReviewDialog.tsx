import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { useRef, useState } from "react";
import { LuCircleAlert, LuFileCheck2, LuTrash2 } from "react-icons/lu";
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
import type { CreditCardImport, CreditCardImportItem } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { closeImportReview, invalidateQueryKeys, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreditCardImportItemRow } from "./CreditCardImportItemRow";
import { CreditPurchaseReconciliationDialog } from "./CreditPurchaseReconciliationDialog";
import { EditImportedCreditPurchaseDialog } from "./EditImportedCreditPurchaseDialog";
import { RefundImportReviewDialog } from "./RefundImportReviewDialog";

export function CreditCardImportReviewDialog({
	importId: suppliedImportId,
	onOpenChange: suppliedOnOpenChange,
	open: suppliedOpen,
}: {
	importId: null | string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [recoveryImportId, setRecoveryImportId] = useState<string | null>(null);
	const importId = recoveryImportId ?? suppliedImportId;
	const open = recoveryImportId !== null || suppliedOpen;
	const [reviewOpening, setReviewOpening] = useState({ importId, open, startedAt: Date.now() });
	if (reviewOpening.open !== open || reviewOpening.importId !== importId) {
		setReviewOpening({ importId, open, startedAt: Date.now() });
	}
	const reviewedImportId = useRef(importId);
	reviewedImportId.current = open ? importId : null;
	const onOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) setRecoveryImportId(null);
		suppliedOnOpenChange(nextOpen);
	};
	const pendingActions = useModalRecoveryStore(state => state.pending);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [recoveredEdit, setRecoveredEdit] = useState<
		Parameters<typeof dataService.creditCardImports.updateItem>[2] | undefined
	>();
	useBackgroundModalRecovery<{
		importId: string;
		item: CreditCardImportItem;
		data: Parameters<typeof dataService.creditCardImports.updateItem>[2];
	}>("credit-card-import-edit", entry => {
		setRecoveryImportId(entry.payload.importId);
		setRecoveredEdit(entry.payload.data);
		setEditingItem(entry.payload.item);
	});
	const [editingItem, setEditingItem] = useState<CreditCardImportItem | null>(null);
	const [recoveredRefund, setRecoveredRefund] =
		useState<Parameters<typeof dataService.creditCardImports.approveRefund>[2]>();
	useBackgroundModalRecovery<{
		importId: string;
		item: CreditCardImportItem;
		data: Parameters<typeof dataService.creditCardImports.approveRefund>[2];
	}>("credit-card-import-refund", entry => {
		setRecoveryImportId(entry.payload.importId);
		setRecoveredRefund(entry.payload.data);
		setReviewingRefund(entry.payload.item);
	});
	const [reviewingRefund, setReviewingRefund] = useState<CreditCardImportItem | null>(null);
	const [recoveredReconciliation, setRecoveredReconciliation] = useState<{
		duplicateId: string;
		sources: Parameters<typeof dataService.creditCardImports.reconcileItem>[2]["sources"];
	}>();
	useBackgroundModalRecovery<{
		importId: string;
		item: CreditCardImportItem;
		duplicateId: string;
		sources: Parameters<typeof dataService.creditCardImports.reconcileItem>[2]["sources"];
	}>("credit-card-import-reconcile", entry => {
		setRecoveryImportId(entry.payload.importId);
		setRecoveredReconciliation(entry.payload);
		setReconcilingImport({ id: entry.payload.importId, item: entry.payload.item });
	});
	const [reconcilingImport, setReconcilingImport] = useState<{
		id: string;
		item: CreditCardImportItem;
	} | null>(null);
	const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
	const creditCardImport = useInfiniteQuery<
		CreditCardImport,
		Error,
		InfiniteData<CreditCardImport>,
		ReturnType<typeof queryKeys.creditCardImports.detail>,
		string | undefined
	>({
		enabled: identity !== null && open && Boolean(importId),
		getNextPageParam: lastPage => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => dataService.creditCardImports.get(importId!, pageParam),
		queryKey: queryKeys.creditCardImports.detail(identity!, importId),
		refetchOnMount: "always",
		// Re-enabling the mounted dialog must also refresh a still-fresh cached batch.
		staleTime: 0,
	});
	const awaitingCurrentReview = creditCardImport.dataUpdatedAt <= reviewOpening.startedAt;
	const reviewLoading = creditCardImport.isPending || (awaitingCurrentReview && !creditCardImport.isError);
	const reviewLoadFailed = awaitingCurrentReview && creditCardImport.isError;
	const creditCardImportData = creditCardImport.data?.pages[0];
	const items = creditCardImport.data?.pages.flatMap(page => page.items) ?? [];
	const creditCards = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const invalidate = (targetImportId = importId) =>
		invalidateQueryKeys(queryClient, [
			queryKeys.creditCardImports.detail(identity!, targetImportId),
			queryKeys.creditCardImports.pending(identity!),
		]);
	const refreshReview = async (targetImportId: string) => {
		const updatedImport = await dataService.creditCardImports.get(targetImportId);
		if (updatedImport.pendingItemCount === 0) {
			if (reviewedImportId.current === targetImportId) onOpenChange(false);
			await closeImportReview(queryClient, identity!, "credit-card", targetImportId);
			return true;
		}
		await invalidate(targetImportId);
		return false;
	};

	const approveItem = (item: CreditCardImportItem) => {
		const targetImportId = importId!;
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["statement"] },
			close: () => {},
			conflictKey: `credit-card-import:${targetImportId}:${item.id}`,
			failureMessage: "Não foi possível aprovar item.",
			loadingMessage: "Aprovando item...",
			onSuccess: async () => {
				await refreshReview(targetImportId);
			},
			progress: "record",
			recovery: {
				entityId: item.id,
				kind: "credit-card-import-action",
				payload: { importId: targetImportId },
			},
			run: () => dataService.creditCardImports.approveItem(targetImportId, item.id),
			successMessage:
				item.installmentAmount < 0
					? "Reembolso aprovado e faturas recalculadas."
					: importedAnticipation(item.description ?? "")
						? "Parcelas antecipadas movidas para esta fatura."
						: "Compra e parcelas criadas.",
		});
	};
	useBackgroundModalRecovery<{ importId: string }>("credit-card-import-action", entry =>
		setRecoveryImportId(entry.payload.importId),
	);

	const approve = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: (_variables: { itemIds: string[] }) =>
			dataService.creditCardImports.approve(importId!, true),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			const reviewFinished = await refreshReview(importId!);
			showToast(
				reviewFinished
					? "Revisão finalizada."
					: `${result.created} ${result.created === 1 ? "compra aprovada" : "compras aprovadas"}. Concilie as pendências restantes.`,
				"positive",
			);
		},
	});
	const discardImport = () => {
		if (!importId) return;
		const targetImportId = importId;
		runBackgroundModalAction({
			close: () => {
				setDiscardConfirmationOpen(false);
				onOpenChange(false);
			},
			conflictKey: `credit-card-import:${targetImportId}:batch`,
			failureMessage: "Não foi possível excluir o lote.",
			loadingMessage: "Excluindo lote...",
			onSuccess: () => closeImportReview(queryClient, identity!, "credit-card", targetImportId),
			progress: "toast",
			recovery: {
				entityId: targetImportId,
				kind: "credit-card-import-discard",
				payload: { importId: targetImportId },
			},
			run: () => dataService.creditCardImports.delete(targetImportId),
			successMessage: "Importação descartada.",
		});
	};
	const discardPending = Boolean(pendingActions[`${identity}:credit-card-import:${importId}:batch`]);
	useBackgroundModalRecovery<{ importId: string }>("credit-card-import-discard", entry => {
		setRecoveryImportId(entry.payload.importId);
		setDiscardConfirmationOpen(true);
	});

	const creditCard = creditCards.data?.find(card => card.id === creditCardImportData?.creditCardId);
	const currencyCode = creditCard?.currency ?? "BRL";
	const creditCardName = creditCard ? getCreditCardDisplayName(creditCard) : "Cartão de crédito";
	const reviewBusy = reviewLoading || reviewLoadFailed || approve.isPending || discardPending;
	const rowBusy = (id: string) =>
		discardPending ||
		(approve.isPending && Boolean(approve.variables?.itemIds.includes(id))) ||
		Boolean(pendingActions[`${identity}:credit-card-import:${importId}:${id}`]);
	const hasApprovingItems = Object.keys(pendingActions).some(key =>
		key.startsWith(`${identity}:credit-card-import:${importId}:`),
	);

	return (
		<>
			<ImportDialog
				childDialogOpen={Boolean(
					editingItem || reviewingRefund || reconcilingImport || discardConfirmationOpen,
				)}
				onOpenChange={onOpenChange}
				open={open}
			>
				<ImportDialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{creditCardImportData?.fileName ?? "Carregando fatura..."}</DialogTitle>
						{creditCard && <DialogDescription>Cartão {creditCardName}</DialogDescription>}
					</DialogHeader>
					<DialogBody>
						{reviewLoading || creditCards.isPending ? (
							<div className="space-y-3">
								{[1, 2, 3].map(item => (
									<Skeleton className="h-20 rounded-2xl" key={item} />
								))}
							</div>
						) : reviewLoadFailed ||
						  (creditCardImport.isError && !creditCardImport.data) ||
						  creditCards.isError ? (
							<EmptyState
								description="Tente novamente em instantes."
								icon={<LuCircleAlert className="size-7" />}
								title="Não foi possível carregar a importação"
							/>
						) : (
							<div className="">
								<div className="bg-card divide-y rounded-2xl border shadow-sm">
									{items.map(item => (
										<CreditCardImportItemRow
											creditCardId={creditCardImportData!.creditCardId}
											creditCardName={creditCardName}
											currencyCode={currencyCode}
											disabled={rowBusy(item.id)}
											item={item}
											key={item.id}
											onApprove={() => approveItem(item)}
											onEdit={() => setEditingItem(item)}
											onReconcile={() => {
												if (!importId) return;
												setReconcilingImport({ id: importId, item });
											}}
											onReviewRefund={() => setReviewingRefund(item)}
											pending={rowBusy(item.id)}
										/>
									))}
									{creditCardImport.hasNextPage && (
										<ActionGroup className="p-3">
											<Button
												className="cursor-pointer disabled:cursor-not-allowed"
												disabled={creditCardImport.isFetchingNextPage}
												onClick={() => creditCardImport.fetchNextPage()}
												variant="outline"
											>
												{creditCardImport.isFetchingNextPage
													? "Carregando..."
													: creditCardImport.isFetchNextPageError
														? "Tentar novamente"
														: "Carregar mais"}
											</Button>
										</ActionGroup>
									)}
								</div>
							</div>
						)}
					</DialogBody>
					<DialogFooter className="flex-row justify-end">
						<Button
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80 cursor-pointer"
							disabled={reviewBusy || hasApprovingItems}
							onClick={() => setDiscardConfirmationOpen(true)}
						>
							<LuTrash2 />
							<span>
								Descartar<span className="hidden sm:inline"> lote</span>
							</span>
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={reviewBusy || hasApprovingItems || items.length === 0}
							onClick={() =>
								approve.mutate({
									itemIds: items
										.filter(
											item =>
												item.duplicates.length === 0 &&
												(item.installmentAmount >= 0 || Boolean(item.refundReview)) &&
												!item.metadataMissing?.length &&
												(item.installmentAmount < 0 ||
													!importedAnticipation(item.description) ||
													Boolean(item.reconciledCreditPurchaseId)),
										)
										.map(item => item.id),
								})
							}
						>
							<LuFileCheck2 />{" "}
							{approve.isPending ? (
								"Aprovando…"
							) : (
								<span>
									Aprovar itens<span className="hidden sm:inline"> sem pendências</span>
								</span>
							)}
						</Button>
					</DialogFooter>
				</ImportDialogContent>
			</ImportDialog>

			<ImportDialog onOpenChange={setDiscardConfirmationOpen} open={discardConfirmationOpen}>
				<ImportDialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Excluir importação?</DialogTitle>
						<DialogDescription>
							Esta ação excluirá todo o lote importado e não poderá ser desfeita.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							disabled={discardPending}
							onClick={() => setDiscardConfirmationOpen(false)}
							variant="outline"
						>
							Cancelar
						</Button>
						<Button
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80 cursor-pointer"
							disabled={discardPending}
							onClick={() => discardImport()}
						>
							<LuTrash2 /> {discardPending ? "Excluindo…" : "Excluir lote"}
						</Button>
					</DialogFooter>
				</ImportDialogContent>
			</ImportDialog>
			<EditImportedCreditPurchaseDialog
				currencyCode={currencyCode}
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
						conflictKey: `credit-card-import:${targetImportId}:${item.id}`,
						failureMessage: "Não foi possível salvar o item.",
						loadingMessage: "Salvando item importado...",
						onSuccess: () => invalidate(targetImportId),
						progress: "record",
						recovery: {
							entityId: item.id,
							kind: "credit-card-import-edit",
							payload: { data, importId: targetImportId, item },
						},
						run: () => dataService.creditCardImports.updateItem(targetImportId, item.id, data),
						successMessage: "Item importado atualizado.",
					});
				}}
				open={editingItem !== null}
				pending={false}
			/>
			{reviewingRefund && creditCardImportData ? (
				<RefundImportReviewDialog
					action="save"
					cardId={creditCardImportData.creditCardId}
					initialData={
						recoveredRefund ??
						(reviewingRefund.refundReview
							? {
									...reviewingRefund.refundReview,
									purchase: reviewingRefund.refundReview.purchase
										? {
												...reviewingRefund.refundReview.purchase,
												installments: Number(
													reviewingRefund.refundReview.purchase.installments,
												),
											}
										: undefined,
								}
							: undefined)
					}
					item={reviewingRefund}
					key={reviewingRefund.id}
					loadSources={() => dataService.creditCardImports.refundSources(importId!)}
					onOpenChange={nextOpen => {
						if (!nextOpen) {
							setReviewingRefund(null);
							setRecoveredRefund(undefined);
						}
					}}
					onSubmit={async data => {
						const item = reviewingRefund;
						const targetImportId = importId!;
						runBackgroundModalAction({
							close: () => {
								setReviewingRefund(null);
								setRecoveredRefund(undefined);
							},
							conflictKey: `credit-card-import:${targetImportId}:${item.id}`,
							failureMessage: "Não foi possível salvar a revisão do reembolso.",
							loadingMessage: "Salvando revisão do reembolso...",
							onSuccess: () => invalidate(targetImportId),
							progress: "record",
							recovery: {
								entityId: item.id,
								kind: "credit-card-import-refund",
								payload: { data, importId: targetImportId, item },
							},
							run: () =>
								dataService.creditCardImports.saveRefundReview(targetImportId, item.id, data),
							successMessage: "Revisão salva. Reembolso continua pendente.",
						});
					}}
					pending={false}
					reviewKey={importId!}
				/>
			) : null}
			<CreditPurchaseReconciliationDialog
				initialSelection={recoveredReconciliation}
				item={reconcilingImport?.item ?? null}
				onOpenChange={nextOpen => {
					if (!nextOpen) {
						setReconcilingImport(null);
						setRecoveredReconciliation(undefined);
					}
				}}
				onReconcile={async (candidate, sources) => {
					if (!reconcilingImport) return;
					const { id: targetImportId, item } = reconcilingImport;
					runBackgroundModalAction({
						close: () => {
							setReconcilingImport(null);
							setRecoveredReconciliation(undefined);
						},
						conflictKey: `credit-card-import:${targetImportId}:${item.id}`,
						failureMessage: "Não foi possível conciliar a compra.",
						loadingMessage: "Conciliando compra...",
						onSuccess: () => invalidate(targetImportId),
						progress: "record",
						recovery: {
							entityId: item.id,
							kind: "credit-card-import-reconcile",
							payload: { duplicateId: candidate.id, importId: targetImportId, item, sources },
						},
						run: () =>
							dataService.creditCardImports.reconcileItem(targetImportId, item.id, {
								creditPurchaseId: candidate.id,
								sources,
							}),
						successMessage: "Conciliação atualizada.",
					});
				}}
				open={reconcilingImport !== null}
				pending={false}
			/>
		</>
	);
}
