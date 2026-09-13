import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DebtPersonPicker } from "@/components/debts";
import { Button } from "@/components/ui/Button";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function DebtInvitations() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [reuseForInvitationId, setReuseForInvitationId] = useState<string | null>(null);
	const [personId, setPersonId] = useState("");
	const invitations = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getInvitations(),
		queryKey: queryKeys.debts.invitations(identity!),
	});
	const refresh = () => invalidateCacheOperation(queryClient, identity!, "invitation");
	const accept = useMutation({
		mutationFn: ({ id, selectedPersonId }: { id: string; selectedPersonId?: string }) =>
			dataService.debts.acceptInvitation(id, selectedPersonId),
		onSuccess: async () => {
			await refresh();
			setReuseForInvitationId(null);
			setPersonId("");
			showToast("Pessoa associada.", "positive");
		},
	});
	const decline = useMutation({
		mutationFn: (id: string) => dataService.debts.declineInvitation(id),
		onSuccess: async () => {
			await refresh();
			showToast("Convite recusado.", "info");
		},
	});
	const received = (invitations.data ?? []).filter(
		item => item.status === "PENDING" && item.direction === "RECEIVED",
	);
	const sent = (invitations.data ?? []).filter(item => item.direction === "SENT");
	if (!received.length && !sent.length) return null;
	return (
		<section aria-label="Convites de dívida" className="grid gap-3 px-4">
			{received.map(invitation => (
				<div className="rounded-2xl border border-primary/20 bg-primary/5 p-4" key={invitation.id}>
					<p className="font-semibold">{invitation.counterpartyName} quer compartilhar uma dívida</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Ao aceitar, saldo e histórico ficam visíveis nos dois lados.
					</p>
					<div className="mt-3 flex gap-2">
						<Button
							className="cursor-pointer"
							disabled={accept.isPending}
							onClick={() => accept.mutate({ id: invitation.id })}
						>
							Criar nova pessoa
						</Button>
						<Button
							className="cursor-pointer"
							onClick={() =>
								setReuseForInvitationId(current => (current === invitation.id ? null : invitation.id))
							}
							variant="outline"
						>
							Usar pessoa existente
						</Button>
						<Button
							className="cursor-pointer"
							disabled={decline.isPending}
							onClick={() => decline.mutate(invitation.id)}
							variant="outline"
						>
							Recusar
						</Button>
					</div>
					{reuseForInvitationId === invitation.id ? (
						<div className="mt-3 grid gap-2 rounded-2xl border bg-background p-3">
							<DebtPersonPicker onValueChange={setPersonId} required value={personId} />
							<Button
								className="cursor-pointer"
								disabled={!personId || accept.isPending}
								onClick={() => accept.mutate({ id: invitation.id, selectedPersonId: personId })}
							>
								Confirmar associação
							</Button>
						</div>
					) : null}
				</div>
			))}
			{sent.length ? (
				<div className="rounded-2xl border bg-card p-4">
					<h2 className="font-semibold">Convites enviados</h2>
					<div className="mt-3 grid gap-2">
						{sent.map(invitation => (
							<div className="flex items-center justify-between gap-3 text-sm" key={invitation.id}>
								<span className="truncate">{invitation.counterpartyName}</span>
								<span className="rounded-full border px-2 py-1 text-muted-foreground text-xs">
									{invitation.status === "PENDING"
										? "Pendente"
										: invitation.status === "ACCEPTED"
											? "Aceito"
											: "Recusado"}
								</span>
							</div>
						))}
					</div>
				</div>
			) : null}
		</section>
	);
}
