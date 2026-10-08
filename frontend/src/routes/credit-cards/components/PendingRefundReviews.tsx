import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currencyScale } from "@zaimu/finance/money";
import { useState } from "react";
import { LuUndo2 } from "react-icons/lu";
import { RefundImportReviewDialog } from "@/components/credit-card-imports/RefundImportReviewDialog";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function PendingRefundReviews({ cardId, count }: { cardId: string; count: number }) {
	const [expanded, setExpanded] = useState(false);
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const reviews = useQuery({
		enabled: Boolean(identity) && expanded && count > 0,
		queryFn: () => dataService.creditCards.getRefundReviews(cardId),
		queryKey: queryKeys.creditCards.refundReviews(identity!, cardId),
	});
	const selected = reviews.data?.find(row => row.id === selectedId);
	const approve = useMutation({
		mutationFn: (data: Parameters<typeof dataService.creditCards.approveRefundReview>[2]) =>
			dataService.creditCards.approveRefundReview(cardId, selectedId!, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			setSelectedId(null);
			await reviews.refetch();
			await invalidateCacheOperation(queryClient, identity!, "statement");
			showToast("Reembolso vinculado e faturas recalculadas.", "positive");
		},
	});
	if (!count) return null;
	if (!expanded)
		return (
			<ActionGroup>
				<Button onClick={() => setExpanded(true)} variant="outline">
					<LuUndo2 />
					Revisar reembolsos ({count})
				</Button>
			</ActionGroup>
		);
	if (reviews.isPending) return <Skeleton className="h-12 rounded-xl" />;
	if (reviews.isError)
		return <p className="text-destructive text-sm">Não foi possível carregar reembolsos pendentes.</p>;
	if (!reviews.data?.length) return null;
	return (
		<div className="grid gap-2 rounded-xl border p-3">
			<p className="font-medium text-sm">Reembolsos antigos aguardam vínculo com a compra original.</p>
			{reviews.data.map(row => (
				<Button key={row.id} onClick={() => setSelectedId(row.id)} variant="outline">
					<LuUndo2 />
					Revisar {row.original.description}
				</Button>
			))}
			{selected ? (
				<RefundImportReviewDialog
					cardId={cardId}
					item={{ ...selected.original, reconciledCreditPurchaseId: null }}
					key={selected.id}
					loadSources={async () => {
						const book = await dataService.creditCards.getBook(cardId);
						return book.purchases.map(p => ({
							description: p.description,
							id: p.id,
							installments: p.installmentAmountsCents.length,
							purchaseDate: p.purchaseDate,
							refundableAmount:
								(p.totalAmountCents -
									book.refunds
										.filter(r => r.purchaseId === p.id && !r.deletedAt)
										.reduce((sum, r) => sum + r.amountCents, 0)) /
								currencyScale(book.card.currency),
							totalAmount: p.totalAmountCents / currencyScale(book.card.currency),
						}));
					}}
					onOpenChange={open => !open && setSelectedId(null)}
					onSubmit={data => approve.mutateAsync(data)}
					pending={approve.isPending}
					reviewKey={`${identity}:${selected.id}`}
				/>
			) : null}
		</div>
	);
}
