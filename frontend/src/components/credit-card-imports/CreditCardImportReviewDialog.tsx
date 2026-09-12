import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuCircleAlert, LuFileCheck2, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
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
import { showToast } from "@/stores";
import { CreditCardImportItemRow } from "./CreditCardImportItemRow";
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
	const [editingItem, setEditingItem] = useState<CreditCardImportItem | null>(null);
	const creditCardImport = useQuery({
		enabled: open && Boolean(importId),
		queryFn: () => dataService.creditCardImports.get(importId!),
		queryKey: ["credit-card-import", importId],
	});
	const creditCards = useQuery({
		enabled: open,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: ["credit-cards"],
	});
	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["credit-card-import", importId] }),
			queryClient.invalidateQueries({ queryKey: ["pending-credit-card-imports"] }),
		]);
	};
	const invalidateCreditCards = async () => {
		await Promise.all([
			invalidate(),
			queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
			queryClient.invalidateQueries({ queryKey: ["credit-cards"] }),
			queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
			queryClient.invalidateQueries({ queryKey: ["transactions"] }),
		]);
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
		onSuccess: async () => {
			if ((creditCardImport.data?.items.length ?? 0) === 1) onOpenChange(false);
			await invalidateCreditCards();
			showToast("Compra e parcelas criadas.", "positive");
		},
	});
	const approve = useMutation({
		mutationFn: () => dataService.creditCardImports.approve(importId!),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async result => {
			onOpenChange(false);
			await invalidateCreditCards();
			showToast(
				`${result.created} ${result.created === 1 ? "compra criada" : "compras criadas"}; parcelas distribuídas nas faturas.`,
				"positive",
			);
		},
	});
	const discard = useMutation({
		mutationFn: () => dataService.creditCardImports.delete(importId!),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			onOpenChange(false);
			await invalidate();
			showToast("Importação descartada.", "info");
		},
	});
	const items = creditCardImport.data?.items ?? [];
	const creditCard = creditCards.data?.find(card => card.id === creditCardImport.data?.creditCardId);
	const creditCardName = creditCard ? getCreditCardDisplayName(creditCard) : "Cartão de crédito";
	const selectedCount = items.filter(item => item.isSelected).length;
	const busy = updateItem.isPending || approveItem.isPending || approve.isPending || discard.isPending;

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
										disabled={busy}
										item={item}
										key={item.id}
										onApprove={() => approveItem.mutate(item.id)}
										onEdit={() => setEditingItem(item)}
										onSelectedChange={isSelected =>
											updateItem.mutate({ data: { isSelected }, itemId: item.id })
										}
									/>
								))}
							</div>
						</ScrollArea>
					)}
					<DialogFooter className="flex-row justify-end">
						<ConfirmActionButton
							className="cursor-pointer"
							confirmation="Descartar toda a importação?"
							disabled={busy}
							onConfirm={() => discard.mutateAsync()}
							variant="destructive"
						>
							<LuTrash2 /> Descartar
						</ConfirmActionButton>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={busy || selectedCount === 0}
							onClick={() => approve.mutate()}
						>
							<LuFileCheck2 /> {approve.isPending ? "Aprovando…" : `Aprovar ${selectedCount}`}
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
		</>
	);
}
