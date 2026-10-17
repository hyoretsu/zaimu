import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { CreditCard } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";
import { type CardAdjustmentDraft, CardAdjustmentForm } from "./CardAdjustmentForm";
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
	const [recoveredDraft, setRecoveredDraft] = useState<CardAdjustmentDraft | null>(null);
	const pending = useModalRecoveryStore(state => state.pending);
	useBackgroundModalRecovery<CardAdjustmentDraft>("card-adjustment", entry => {
		setRecoveredDraft(entry.payload);
		setEditing(entry.payload.card ?? "new");
		onOpenChange(true);
	});
	useBackgroundModalRecovery<CreditCard>("card-adjustment-delete", () => {
		setEditing(null);
		onOpenChange(true);
	});
	const remove = (card: CreditCard) =>
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["creditCard"] },
			close: () => onOpenChange(false),
			conflictKey: `card-adjustment:${card.id}`,
			failureMessage: "Não foi possível excluir o ajuste.",
			loadingMessage: "Excluindo ajuste de cartão...",
			recovery: { entityId: card.id, kind: "card-adjustment-delete", payload: card },
			run: () => dataService.creditCards.setStatementCutoff(card.id, null),
			successMessage: "Ajuste de cartão excluído.",
		});
	const adjusted = cards
		.filter(card => card.ignoreStatementsBefore)
		.toSorted((a, b) => (a.accountName ?? "").localeCompare(b.accountName ?? "", "pt-BR"));
	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open && editing === null}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Ajustes de cartões</DialogTitle>
						<DialogDescription>
							Escolha uma fatura limite por cartão. Ela e todas as anteriores deixam de afetar saldos,
							pendências e limite. Compras e importações continuam disponíveis.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div>
							<div className="grid gap-2">
								{adjusted.length ? (
									adjusted.map(card => (
										<CardAdjustmentListItem
											card={card}
											key={card.id}
											onEdit={() => setEditing(card)}
											onRemove={() => remove(card)}
											pending={!!pending[`${identity}:card-adjustment:${card.id}`]}
										/>
									))
								) : (
									<p className="text-muted-foreground text-sm">Nenhum ajuste registrado.</p>
								)}
							</div>
						</div>
						<ActionGroup>
							<Button
								className="cursor-pointer"
								disabled={!cards.some(card => !card.ignoreStatementsBefore)}
								onClick={() => setEditing("new")}
							>
								<LuPlus /> Novo ajuste
							</Button>
						</ActionGroup>
					</DialogBody>
				</DialogContent>
			</Dialog>
			{editing !== null ? (
				<CardAdjustmentForm
					card={editing === "new" ? null : editing}
					cards={cards}
					initialDraft={recoveredDraft ?? undefined}
					key={editing === "new" ? "new" : editing.id}
					onClose={() => {
						setEditing(null);
						setRecoveredDraft(null);
					}}
				/>
			) : null}
		</>
	);
}
