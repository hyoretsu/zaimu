import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuShoppingCart, LuUsersRound, LuWalletCards } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { DebtInvitation } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { getDebtEventLabel } from "../../debts/components/debt-event";
import { DebtInvitationAssociationDialog } from "./DebtInvitationAssociationDialog";
import { DebtInvitationDeclineDialog } from "./DebtInvitationDeclineDialog";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function DebtInvitationDialog({
	invitation,
	onOpenChange,
	onResolved,
	open,
}: {
	invitation: DebtInvitation;
	onOpenChange: (open: boolean) => void;
	onResolved: () => void;
	open: boolean;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [step, setStep] = useState<"details" | "association" | "decline">("details");
	const accept = useMutation({
		mutationFn: (personId?: string) => dataService.debts.acceptInvitation(invitation.id, personId),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível associar a pessoa.", "negative"),
		onSuccess: async () => {
			if (identity) await invalidateCacheOperation(queryClient, identity, "invitation");
			showToast("Pessoa associada.", "positive");
			onResolved();
		},
	});
	const decline = useMutation({
		mutationFn: () => dataService.debts.declineInvitation(invitation.id),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível recusar o convite.", "negative"),
		onSuccess: async () => {
			if (identity) await invalidateCacheOperation(queryClient, identity, "invitation");
			showToast("Convite recusado.", "info");
			onResolved();
		},
	});
	const isPending = accept.isPending || decline.isPending;
	const returnToDetails = () => setStep("details");
	const dismissInvitation = () => onOpenChange(false);
	return step === "association" ? (
		<DebtInvitationAssociationDialog
			onApprove={personId => accept.mutate(personId)}
			onOpenChange={nextOpen => (nextOpen ? setStep("association") : returnToDetails())}
			open
			pending={isPending}
		/>
	) : step === "decline" ? (
		<DebtInvitationDeclineDialog
			onDecline={() => decline.mutate()}
			onDismiss={dismissInvitation}
			open
			pending={isPending}
		/>
	) : (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-4 sm:max-w-lg sm:p-6">
				<DialogHeader>
					<DialogTitle>{invitation.counterpartyName} quer compartilhar uma dívida</DialogTitle>
					<DialogDescription>
						Confira os lançamentos atuais. Ao aceitar, o saldo e o histórico ficam visíveis nos dois lados.
					</DialogDescription>
				</DialogHeader>
				<div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-muted/30 p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<LuUsersRound className="size-5" />
						</div>
						<div className="min-w-0">
							<p className="font-medium text-sm">Saldo atual de {invitation.counterpartyName}</p>
							<p className="text-muted-foreground text-xs">
								{invitation.events.length} {invitation.events.length === 1 ? "lançamento" : "lançamentos"}
							</p>
						</div>
					</div>
					<strong
						className={
							invitation.balance >= 0
								? "shrink-0 text-right text-emerald-600 text-sm sm:text-base"
								: "shrink-0 text-right text-rose-600 text-sm sm:text-base"
						}
					>
						{invitation.balance >= 0 ? "+" : "−"}
						{currency.format(Math.abs(invitation.balance))}
					</strong>
				</div>
				<ScrollArea className="min-h-0 w-full">
					<div className="space-y-4">
						<div className="space-y-2">
							{invitation.events.map(event => (
								<div
									className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3"
									key={event.id}
								>
									<div className="text-muted-foreground">
										{event.kind === "PURCHASE" ? <LuShoppingCart /> : <LuWalletCards />}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">{getDebtEventLabel(event)}</p>
										<p className="truncate text-muted-foreground text-xs">
											{event.date ? formatLocalDate(event.date) : "Sem data"}
											{formatLocalTime(event.time) ? ` · ${formatLocalTime(event.time)}` : ""}
										</p>
									</div>
									<span
										className={
											event.effect >= 0
												? "shrink-0 text-right text-emerald-600 text-sm sm:text-base"
												: "shrink-0 text-right text-rose-600 text-sm sm:text-base"
										}
									>
										{event.effect >= 0 ? "+" : "−"}
										{currency.format(Math.abs(event.effect))}
									</span>
								</div>
							))}
							{!invitation.events.length ? (
								<p className="rounded-xl border border-dashed p-4 text-muted-foreground text-sm">
									Nenhum lançamento será associado.
								</p>
							) : null}
						</div>
					</div>
				</ScrollArea>
				<DialogFooter className="!grid sm:!grid shrink-0 grid-cols-2 gap-2">
					<Button
						className="w-full cursor-pointer"
						disabled={isPending}
						onClick={() => setStep("decline")}
						type="button"
						variant="outline"
					>
						Recusar
					</Button>
					<Button
						className="w-full cursor-pointer"
						disabled={isPending}
						onClick={() => setStep("association")}
						type="button"
					>
						Aprovar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
