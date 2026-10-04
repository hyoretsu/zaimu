import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import type { CreditCard } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreatePurchaseDialog } from "./CreatePurchaseDialog";
import { CreditCardStatementBrowser } from "./CreditCardStatementBrowser";

export function CreditCardStatementsDialog({
	card,
	onOpenChange,
}: {
	card: CreditCard | null;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [isCreatePurchaseOpen, setIsCreatePurchaseOpen] = useState(false);
	const purchase = useMutation({
		mutationFn: ({
			cardId,
			data,
		}: {
			cardId: string;
			data: Parameters<typeof dataService.creditCards.addPurchase>[1];
		}) => dataService.creditCards.addPurchase(cardId, data),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível registrar a compra.", "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "statement");
			showToast("Compra registrada e faturas recalculadas.", "positive");
		},
	});
	return (
		<Dialog onOpenChange={onOpenChange} open={Boolean(card)}>
			<DialogContent className="grid max-h-[min(90dvh,46rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden p-4 sm:max-w-5xl sm:gap-6 sm:p-6">
				<DialogHeader>
					<DialogTitle>Faturas de {card?.accountName ?? "Cartão de crédito"}</DialogTitle>
					<DialogDescription>Selecione um mês para consultar os detalhes e as transações.</DialogDescription>
				</DialogHeader>
				{card && (
					<CreditCardStatementBrowser
						card={card}
						key={card.id}
						onAddPurchase={() => setIsCreatePurchaseOpen(true)}
					/>
				)}
				{card && (
					<CreatePurchaseDialog
						cards={[card]}
						initialCardId={card.id}
						key={card.id}
						onOpenChange={setIsCreatePurchaseOpen}
						onSubmit={async (cardId, data) => {
							await purchase.mutateAsync({ cardId, data });
						}}
						open={isCreatePurchaseOpen}
						pending={purchase.isPending}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
