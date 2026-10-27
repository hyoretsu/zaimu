import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import type { CreditCard } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreatePurchaseDialog } from "./CreatePurchaseDialog";
import { CreditCardStatementBrowser } from "./CreditCardStatementBrowser";
import { statementViewParameters } from "./statement-modal-context";

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
		meta: { cacheOperations: ["statement"] },
		mutationFn: ({
			cardId,
			data,
		}: {
			cardId: string;
			data: Parameters<typeof dataService.creditCards.addPurchase>[1];
		}) => dataService.creditCards.addPurchase(cardId, data),
		onError: error =>
			showToast(
				error instanceof Error ? error.message : "Não foi possível registrar a compra.",
				"negative",
			),
		onSuccess: async () => {
			showToast("Compra registrada e faturas recalculadas.", "positive");
		},
	});
	return (
		<Dialog
			onOpenChange={onOpenChange}
			open={Boolean(card)}
			url={card ? { clear: statementViewParameters, parameter: "card", value: card.id } : undefined}
		>
			<DialogContent className="gap-4 p-4 sm:max-w-5xl sm:gap-6 sm:p-6 [&>[data-slot=dialog-close]]:hidden">
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
