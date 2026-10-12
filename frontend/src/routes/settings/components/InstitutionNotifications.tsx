import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuCheck } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";

interface Notification {
	id: string;
	type: string;
	payload: { proposalId?: string; status?: string; reason?: string };
	readAt: string | null;
	createdAt: string;
}
const statusNames: Record<string, string> = {
	APPROVED: "Aprovada",
	ASSOCIATED: "Associada",
	REJECTED: "Rejeitada",
};
export function InstitutionNotifications() {
	const guest = useAuthStore(state => state.isGuestMode);
	const userId = useAuthStore(state => state.user?.id);
	const [pending, setPending] = useState<string[]>([]);
	const query = useQuery({
		enabled: !guest,
		queryFn: () => fetchWithAuth<Notification[]>("/financial-institutions/notifications"),
		queryKey: ["institution-notifications", userId],
	});
	if (guest) return null;
	return (
		<section className="card grid gap-3 p-4">
			<h2 className="font-semibold">
				Notificações institucionais{" "}
				{query.data ? `(${query.data.filter(item => !item.readAt).length} não lidas)` : ""}
			</h2>
			{query.isPending ? (
				<Skeleton className="h-20 w-full" />
			) : query.isError ? (
				<p role="alert">{query.error.message}</p>
			) : query.data?.length ? (
				query.data.map(item => (
					<article className="grid gap-2 rounded-xl border p-3" key={item.id}>
						<p className="text-sm">
							{item.type === "INSTITUTION_REVIEW"
								? "Proposta institucional aguarda revisão"
								: `Resultado da proposta: ${statusNames[item.payload.status ?? ""] ?? "Revisada"}`}
						</p>
						{item.payload.reason && <p className="text-muted-foreground text-sm">{item.payload.reason}</p>}
						<p className="text-muted-foreground text-xs">
							{item.createdAt.slice(0, 10)} - {item.payload.proposalId}
						</p>
						{!item.readAt && (
							<ActionGroup>
								<Button
									disabled={pending.includes(item.id)}
									onClick={() => {
										setPending(ids => [...ids, item.id]);
										void fetchWithAuth(`/financial-institutions/notifications/${item.id}/read`, {
											method: "POST",
										})
											.then(async () => {
												await query.refetch();
												showToast("Notificação marcada como lida", "info");
											})
											.catch(error => showToast(error.message, "negative"))
											.finally(() => setPending(ids => ids.filter(id => id !== item.id)));
									}}
									size="sm"
									variant="outline"
								>
									<LuCheck />
									Marcar como lida
								</Button>
							</ActionGroup>
						)}
					</article>
				))
			) : (
				<p className="text-muted-foreground text-sm">Nenhuma notificação registrada.</p>
			)}
		</section>
	);
}
