import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuShoppingCart, LuUsersRound, LuWalletCards } from "react-icons/lu";
import { DebtPersonPicker } from "@/components/debts";
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
	const [personId, setPersonId] = useState("");
	const [reusePerson, setReusePerson] = useState(false);
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
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{invitation.counterpartyName} quer compartilhar uma dívida</DialogTitle>
					<DialogDescription>
						Confira os lançamentos atuais. Ao aceitar, o saldo e o histórico ficam visíveis nos dois lados.
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<LuUsersRound className="size-5" />
						</div>
						<div>
							<p className="font-medium text-sm">Saldo atual de {invitation.counterpartyName}</p>
							<p className="text-muted-foreground text-xs">
								{invitation.events.length} {invitation.events.length === 1 ? "lançamento" : "lançamentos"}
							</p>
						</div>
					</div>
					<strong className={invitation.balance >= 0 ? "text-emerald-600" : "text-rose-600"}>
						{invitation.balance >= 0 ? "+" : "−"}
						{currency.format(Math.abs(invitation.balance))}
					</strong>
				</div>
				<ScrollArea className="min-h-0 pr-3">
					<div className="space-y-2">
						{invitation.events.map(event => (
							<div className="flex items-center gap-3 rounded-xl border p-3" key={event.id}>
								<div className="shrink-0 text-muted-foreground">
									{event.kind === "PURCHASE" ? <LuShoppingCart /> : <LuWalletCards />}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{getDebtEventLabel(event)}</p>
									<p className="truncate text-muted-foreground text-xs">
										{event.date ? formatLocalDate(event.date) : "Sem data"}
										{formatLocalTime(event.time) ? ` · ${formatLocalTime(event.time)}` : ""}· Criado por{" "}
										{event.createdByName.trim().split(/\s+/)[0]}
									</p>
								</div>
								<span className={event.effect >= 0 ? "shrink-0 text-emerald-600" : "shrink-0 text-rose-600"}>
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
				</ScrollArea>
				{reusePerson ? (
					<div className="grid gap-3 rounded-2xl border bg-muted/30 p-4">
						<DebtPersonPicker onValueChange={setPersonId} required value={personId} />
						<Button
							className="cursor-pointer"
							disabled={!personId || accept.isPending || decline.isPending}
							onClick={() => accept.mutate(personId)}
						>
							Confirmar associação
						</Button>
					</div>
				) : null}
				<DialogFooter>
					<Button
						className="cursor-pointer"
						disabled={accept.isPending || decline.isPending}
						onClick={() => accept.mutate()}
					>
						Criar nova pessoa
					</Button>
					<Button
						className="cursor-pointer"
						disabled={accept.isPending || decline.isPending}
						onClick={() => setReusePerson(current => !current)}
						variant="outline"
					>
						Usar pessoa existente
					</Button>
					<Button
						className="cursor-pointer"
						disabled={accept.isPending || decline.isPending}
						onClick={() => decline.mutate()}
						variant="outline"
					>
						Recusar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
