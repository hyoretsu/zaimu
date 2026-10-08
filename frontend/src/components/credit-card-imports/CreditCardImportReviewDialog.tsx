import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { importedAnticipation } from "@zaimu/finance/imported-anticipation";
import { useState } from "react";
import { LuCircleAlert, LuFileCheck2, LuTrash2 } from "react-icons/lu";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCardImport, CreditCardImportItem } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import {
	closeImportReview,
	invalidateCacheOperation,
	invalidateQueryKeys,
	queryKeys,
	useCacheIdentity,
} from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreditCardImportItemRow } from "./CreditCardImportItemRow";
import { CreditPurchaseReconciliationDialog } from "./CreditPurchaseReconciliationDialog";
import { EditImportedCreditPurchaseDialog } from "./EditImportedCreditPurchaseDialog";
import { RefundImportReviewDialog } from "./RefundImportReviewDialog";

export function CreditCardImportReviewDialog({
	importId,
	onOpenChange,
	open,
}: {
	importId: null | string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [editingItem, setEditingItem] = useState<CreditCardImportItem | null>(null);
	const [reviewingRefund, setReviewingRefund] = useState<CreditCardImportItem | null>(null);
	const [reconcilingImport, setReconcilingImport] = useState<{
		id: string;
		item: CreditCardImportItem;
	} | null>(null);
	const [approvingItemIds, setApprovingItemIds] = useState<Set<string>>(new Set());
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
	});
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
	const invalidateCreditCards = () => invalidateCacheOperation(queryClient, identity!, "statement");
	const closeFinishedReview = async () => {
		if (!importId) return;
		onOpenChange(false);
		await closeImportReview(queryClient, identity!, "credit-card", importId);
	};
	const updateItem = useMutation({
		mutationFn: ({
			data,
			itemId,
		}: {
			data: Parameters<typeof dataService.creditCardImports.updateItem>[2];
			itemId: string;
		}) => dataService.creditCardImports.updateItem(importId!, itemId, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setEditingItem(null);
			await invalidate();
			showToast("Compra importada atualizada.", "positive");
		},
	});
	const approveItem = useMutation({
		mutationFn: (itemId: string) => dataService.creditCardImports.approveItem(importId!, itemId),
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
			await invalidateCreditCards();
			if ((creditCardImportData?.pendingItemCount ?? 0) === 1) await closeFinishedReview();
			else await invalidate();
			showToast(
				importedAnticipation(items.find(item => item.id === approveItem.variables)?.description ?? "")
					? "Parcelas antecipadas movidas para esta fatura."
					: "Compra e parcelas criadas.",
				"positive",
			);
		},
	});
	const approveRefund = useMutation({
		mutationFn: (data: Parameters<typeof dataService.creditCardImports.approveRefund>[2]) =>
			dataService.creditCardImports.approveRefund(importId!, reviewingRefund!.id, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			setReviewingRefund(null);
			await invalidateCreditCards();
			if (result.finished) await closeFinishedReview();
			else await invalidate();
			showToast("Reembolso aprovado e faturas recalculadas.", "positive");
		},
	});
	const reconcileItem = useMutation({
		mutationFn: ({
			creditPurchaseId,
			importId: reconciliationImportId,
			itemId,
			sources,
		}: {
			creditPurchaseId: string;
			importId: string;
			itemId: string;
			sources?: Parameters<typeof dataService.creditCardImports.reconcileItem>[2]["sources"];
		}) =>
			dataService.creditCardImports.reconcileItem(reconciliationImportId, itemId, {
				creditPurchaseId,
				sources,
			}),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async (_data, variables) => {
			setReconcilingImport(null);
			await invalidate(variables.importId);
			showToast("Conciliação atualizada.", "positive");
		},
	});
	const approve = useMutation({
		mutationFn: () => dataService.creditCardImports.approve(importId!),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			const reviewFinished = result.created === creditCardImportData?.pendingItemCount;
			await invalidateCreditCards();
			if (reviewFinished) await closeFinishedReview();
			else await invalidate();
			showToast(
				reviewFinished
					? "Revisão finalizada."
					: `${result.created} ${result.created === 1 ? "compra aprovada" : "compras aprovadas"}. Concilie as pendências restantes.`,
				"positive",
			);
		},
	});
	const discard = useMutation({
		mutationFn: () => dataService.creditCardImports.delete(importId!),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setDiscardConfirmationOpen(false);
			await closeFinishedReview();
			showToast("Importação descartada.", "info");
		},
	});
	const creditCard = creditCards.data?.find(card => card.id === creditCardImportData?.creditCardId);
	const currencyCode = creditCard?.currency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const creditCardName = creditCard ? getCreditCardDisplayName(creditCard) : "Cartão de crédito";
	const reviewBusy = approve.isPending || discard.isPending;
	const rowBusy = (id: string) =>
		reviewBusy ||
		approvingItemIds.has(id) ||
		(updateItem.isPending && updateItem.variables?.itemId === id) ||
		(reconcileItem.isPending && reconcileItem.variables?.itemId === id) ||
		(approveRefund.isPending && reviewingRefund?.id === id);
	const hasApprovingItems =
		approvingItemIds.size > 0 || updateItem.isPending || reconcileItem.isPending || approveRefund.isPending;

	return (
		<>
			<ImportDialog
				childDialogOpen={Boolean(
					editingItem || reviewingRefund || reconcilingImport || discardConfirmationOpen,
				)}
				onOpenChange={onOpenChange}
				open={open}
			>
				<ImportDialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Revisar fatura importada</DialogTitle>
						<DialogDescription>
							{creditCardImportData
								? `${creditCardImportData.fileName} · fecha em ${formatLocalDate(creditCardImportData.statementDate)}. Compras parceladas serão criadas na data da primeira parcela. Antecipações serão vinculadas à compra original.`
								: "Carregando compras da fatura…"}
						</DialogDescription>
					</DialogHeader>
					{creditCardImport.isPending || creditCards.isPending ? (
						<div className="space-y-3">
							{[1, 2, 3].map(item => (
								<Skeleton className="h-20 rounded-2xl" key={item} />
							))}
						</div>
					) : creditCardImport.isError ? (
						<EmptyState
							description="Tente novamente em instantes."
							icon={<LuCircleAlert className="size-7" />}
							title="Não foi possível carregar a importação"
						/>
					) : (
						<ScrollArea className="min-h-0 pr-3">
							{creditCardImportData?.previousBalanceCheck && (
								<p className="mb-3 rounded-xl border p-3 text-sm">
									Saldo anterior informado:{" "}
									{currency.format(creditCardImportData.previousBalanceCheck.reported)}.{" "}
									{creditCardImportData.previousBalanceCheck.matches
										? "Confere com a transposição do histórico."
										: `Histórico calcula ${currency.format(creditCardImportData.previousBalanceCheck.calculated)}. Confira compras e pagamentos anteriores.`}
								</p>
							)}
							<div className="divide-y rounded-2xl border bg-card shadow-sm">
								{items.map(item => (
									<CreditCardImportItemRow
										creditCardId={creditCardImportData!.creditCardId}
										creditCardName={creditCardName}
										currencyCode={currencyCode}
										disabled={rowBusy(item.id)}
										item={item}
										key={item.id}
										onApprove={() =>
											item.installmentAmount < 0 ? setReviewingRefund(item) : approveItem.mutate(item.id)
										}
										onEdit={() => setEditingItem(item)}
										onReconcile={() => {
											if (!importId) return;
											setReconcilingImport({ id: importId, item });
										}}
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
											{creditCardImport.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
										</Button>
									</ActionGroup>
								)}
							</div>
						</ScrollArea>
					)}
					<DialogFooter className="flex-row justify-end">
						<Button
							className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/80"
							disabled={reviewBusy || hasApprovingItems}
							onClick={() => setDiscardConfirmationOpen(true)}
						>
							<LuTrash2 /> Descartar lote
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={reviewBusy || hasApprovingItems || items.length === 0}
							onClick={() => approve.mutate()}
						>
							<LuFileCheck2 /> {approve.isPending ? "Finalizando…" : "Finalizar revisão"}
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
							disabled={discard.isPending}
							onClick={() => setDiscardConfirmationOpen(false)}
							variant="outline"
						>
							Cancelar
						</Button>
						<Button
							className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/80"
							disabled={discard.isPending}
							onClick={() => discard.mutate()}
						>
							<LuTrash2 /> {discard.isPending ? "Excluindo…" : "Excluir lote"}
						</Button>
					</DialogFooter>
				</ImportDialogContent>
			</ImportDialog>
			<EditImportedCreditPurchaseDialog
				currencyCode={currencyCode}
				item={editingItem}
				onOpenChange={nextOpen => !nextOpen && setEditingItem(null)}
				onSubmit={data => editingItem && updateItem.mutate({ data, itemId: editingItem.id })}
				open={editingItem !== null}
				pending={updateItem.isPending}
			/>
			{reviewingRefund && creditCardImportData ? (
				<RefundImportReviewDialog
					cardId={creditCardImportData.creditCardId}
					item={reviewingRefund}
					key={reviewingRefund.id}
					loadSources={() => dataService.creditCardImports.refundSources(importId!)}
					onOpenChange={nextOpen => !nextOpen && setReviewingRefund(null)}
					onSubmit={data => approveRefund.mutateAsync(data)}
					pending={approveRefund.isPending}
					reviewKey={importId!}
				/>
			) : null}
			<CreditPurchaseReconciliationDialog
				item={reconcilingImport?.item ?? null}
				onOpenChange={nextOpen => !nextOpen && setReconcilingImport(null)}
				onReconcile={async (candidate, sources) => {
					if (!reconcilingImport) return;
					await reconcileItem.mutateAsync({
						creditPurchaseId: candidate.id,
						importId: reconcilingImport.id,
						itemId: reconcilingImport.item.id,
						sources,
					});
				}}
				open={reconcilingImport !== null}
				pending={reconcileItem.isPending}
			/>
		</>
	);
}
