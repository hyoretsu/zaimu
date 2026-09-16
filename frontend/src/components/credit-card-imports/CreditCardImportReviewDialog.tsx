import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuCircleAlert, LuFileCheck2, LuTrash2 } from "react-icons/lu";
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
import type { CreditCardImportItem } from "@/lib/api";
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
	const [reconcilingItem, setReconcilingItem] = useState<CreditCardImportItem | null>(null);
	const [approvingItemIds, setApprovingItemIds] = useState<Set<string>>(new Set());
	const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
	const creditCardImport = useQuery({
		enabled: identity !== null && open && Boolean(importId),
		queryFn: () => dataService.creditCardImports.get(importId!),
		queryKey: queryKeys.creditCardImports.detail(identity!, importId),
	});
	const creditCards = useQuery({
		enabled: identity !== null && open,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const invalidate = () =>
		invalidateQueryKeys(queryClient, [
			queryKeys.creditCardImports.detail(identity!, importId),
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
			if ((creditCardImport.data?.items.length ?? 0) === 1) await closeFinishedReview();
			else await invalidate();
			showToast("Compra e parcelas criadas.", "positive");
		},
	});
	const reconcileItem = useMutation({
		mutationFn: ({
			creditPurchaseId,
			itemId,
			sources,
		}: {
			creditPurchaseId: string;
			itemId: string;
			sources?: Parameters<typeof dataService.creditCardImports.reconcileItem>[2]["sources"];
		}) => dataService.creditCardImports.reconcileItem(importId!, itemId, { creditPurchaseId, sources }),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setReconcilingItem(null);
			await invalidate();
			showToast("Conciliação atualizada.", "positive");
		},
	});
	const approve = useMutation({
		mutationFn: () => dataService.creditCardImports.approve(importId!),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			const reviewFinished = result.created === items.length;
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
	const items = creditCardImport.data?.items ?? [];
	const creditCard = creditCards.data?.find(card => card.id === creditCardImport.data?.creditCardId);
	const creditCardName = creditCard ? getCreditCardDisplayName(creditCard) : "Cartão de crédito";
	const reviewBusy =
		updateItem.isPending || reconcileItem.isPending || approve.isPending || discard.isPending;
	const hasApprovingItems = approvingItemIds.size > 0;

	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Revisar fatura importada</DialogTitle>
						<DialogDescription>
							{creditCardImport.data
								? `${creditCardImport.data.fileName} · fecha em ${formatLocalDate(creditCardImport.data.statementDate)}. Compras parceladas serão criadas na data da primeira parcela.`
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
							<div className="divide-y rounded-2xl border bg-card shadow-sm">
								{items.map(item => (
									<CreditCardImportItemRow
										creditCardId={creditCardImport.data!.creditCardId}
										creditCardName={creditCardName}
										disabled={reviewBusy || approvingItemIds.has(item.id)}
										item={item}
										key={item.id}
										onApprove={() => approveItem.mutate(item.id)}
										onEdit={() => setEditingItem(item)}
										onReconcile={() => setReconcilingItem(item)}
									/>
								))}
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
				</DialogContent>
			</Dialog>
			<Dialog onOpenChange={setDiscardConfirmationOpen} open={discardConfirmationOpen}>
				<DialogContent showCloseButton={false}>
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
							onClick={() => {
								setDiscardConfirmationOpen(false);
								onOpenChange(false);
							}}
							variant="outline"
						>
							Fechar modal
						</Button>
						<Button
							className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/80"
							disabled={discard.isPending}
							onClick={() => discard.mutate()}
						>
							<LuTrash2 /> {discard.isPending ? "Excluindo…" : "Excluir lote"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<EditImportedCreditPurchaseDialog
				item={editingItem}
				onOpenChange={nextOpen => !nextOpen && setEditingItem(null)}
				onSubmit={data => editingItem && updateItem.mutate({ data, itemId: editingItem.id })}
				open={editingItem !== null}
				pending={updateItem.isPending}
			/>
			<CreditPurchaseReconciliationDialog
				item={reconcilingItem}
				onOpenChange={nextOpen => !nextOpen && setReconcilingItem(null)}
				onReconcile={async (candidate, sources) => {
					if (!reconcilingItem) return;
					await reconcileItem.mutateAsync({
						creditPurchaseId: candidate.id,
						itemId: reconcilingItem.id,
						sources,
					});
				}}
				open={reconcilingItem !== null}
				pending={reconcileItem.isPending}
			/>
		</>
	);
}
