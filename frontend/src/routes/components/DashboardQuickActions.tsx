import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { LuCreditCard, LuPlus } from "react-icons/lu";
import { CreateTransactionDialog } from "@/components/transactions";
import type { PageAction } from "@/components/ui/page-action";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreatePurchaseDialog } from "../credit-cards/components";

export function DashboardQuickActions({ children }: { children: (actions: PageAction[]) => ReactNode }) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const pathname = useLocation().pathname;
	const [transactionOpen, setTransactionOpen] = useState(false);
	const [purchaseOpen, setPurchaseOpen] = useState(false);

	useEffect(() => {
		setTransactionOpen(false);
		setPurchaseOpen(false);
	}, [pathname]);

	const cards = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const purchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: ({
			cardId,
			data,
		}: {
			cardId: string;
			data: Parameters<typeof dataService.creditCards.addPurchase>[1];
		}) => dataService.creditCards.addPurchase(cardId, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Compra registrada e faturas recalculadas.", "positive");
		},
	});

	return (
		<>
			{children([
				{
					icon: LuPlus,
					label: "Nova transação",
					onClick: () => setTransactionOpen(true),
					variant: "default",
				},
				...(cards.isPending || cards.isError || cards.data?.length
					? [{ icon: LuCreditCard, label: "Nova compra", onClick: () => setPurchaseOpen(true) }]
					: []),
			])}
			<CreateTransactionDialog onOpenChange={setTransactionOpen} open={transactionOpen} />
			<CreatePurchaseDialog
				cards={cards.data ?? []}
				cardsError={cards.isError}
				cardsLoading={cards.isPending}
				onOpenChange={setPurchaseOpen}
				onRetryCards={() => void cards.refetch()}
				onSubmit={async (cardId, data) => {
					await purchase.mutateAsync({ cardId, data });
				}}
				open={purchaseOpen}
				pending={purchase.isPending}
			/>
		</>
	);
}
