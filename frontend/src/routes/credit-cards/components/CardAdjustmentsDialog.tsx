import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { CreditCard } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CardAdjustmentForm } from "./CardAdjustmentForm";
import { CardAdjustmentListItem } from "./CardAdjustmentListItem";

export function CardAdjustmentsDialog({
	cards,
	onOpenChange,
	open,
}: {
	cards: CreditCard[];
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState<CreditCard | "new" | null>(null);
	const remove = useMutation({
		mutationFn: (cardId: string) => dataService.creditCards.setStatementCutoff(cardId, null),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "creditCard");
			showToast("Ajuste de cartão excluído.", "positive");
		},
	});
	const adjusted = cards
		.filter(card => card.ignoreStatementsBefore)
		.toSorted((a, b) => (a.accountName ?? "").localeCompare(b.accountName ?? "", "pt-BR"));
	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open && editing === null}>
				<DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Ajustes de cartões</DialogTitle>
						<DialogDescription>
							Escolha uma fatura limite por cartão. Ela e todas as anteriores deixam de afetar saldos,
							pendências e limite. Compras e importações continuam disponíveis.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[60dvh] min-h-0 pr-3" type="always">
						<div className="grid gap-2">
							{adjusted.length ? (
								adjusted.map(card => (
									<CardAdjustmentListItem
										card={card}
										key={card.id}
										onEdit={() => setEditing(card)}
										onRemove={() => remove.mutate(card.id)}
										pending={remove.isPending && remove.variables === card.id}
									/>
								))
							) : (
								<p className="text-muted-foreground text-sm">Nenhum ajuste registrado.</p>
							)}
						</div>
					</ScrollArea>
					<ActionGroup>
						<Button
							className="cursor-pointer"
							disabled={!cards.some(card => !card.ignoreStatementsBefore)}
							onClick={() => setEditing("new")}
						>
							<LuPlus /> Novo ajuste
						</Button>
					</ActionGroup>
				</DialogContent>
			</Dialog>
			{editing !== null ? (
				<CardAdjustmentForm
					card={editing === "new" ? null : editing}
					cards={cards}
					key={editing === "new" ? "new" : editing.id}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</>
	);
}
