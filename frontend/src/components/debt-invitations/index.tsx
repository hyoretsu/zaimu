import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuFileSearch, LuUsersRound } from "react-icons/lu";
import { ActionNotice } from "@/components/ui/ActionNotice";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { DebtInvitationDialog } from "./DebtInvitationDialog";
import { DebtInvitationPickerDialog } from "./DebtInvitationPickerDialog";

export function PendingDebtInvitations() {
	const identity = useCacheIdentity();
	const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);
	const [selectionOpen, setSelectionOpen] = useState(false);
	const invitations = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getInvitations(),
		queryKey: queryKeys.debts.invitations(identity!),
	});
	if (invitations.isPending && identity !== null) return <Skeleton className="h-[5.625rem] rounded-2xl" />;
	if (invitations.isError && !invitations.data)
		return (
			<section className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 p-4">
				<p className="text-sm">Não foi possível verificar convites de dívida.</p>
				<Button className="cursor-pointer" onClick={() => invitations.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</section>
		);
	const received = (invitations.data ?? []).filter(
		invitation => invitation.direction === "RECEIVED" && invitation.status === "PENDING",
	);
	const selectedInvitation = received.find(invitation => invitation.id === selectedInvitationId) ?? null;
	if (!received.length) return null;
	return (
		<>
			<ActionNotice
				action={
					<Button
						className="cursor-pointer"
						onClick={() => {
							if (received.length === 1) {
								setSelectedInvitationId(received[0]!.id);
								return;
							}
							setSelectionOpen(true);
						}}
						variant="outline"
					>
						<LuFileSearch /> Revisar
					</Button>
				}
				description={`${received.length} ${received.length === 1 ? "convite aguarda" : "convites aguardam"} sua associação.`}
				icon={<LuUsersRound aria-hidden="true" className="size-5 text-amber-700" />}
				title="Convites de dívida aguardando revisão"
				tone="warning"
			/>
			<DebtInvitationPickerDialog
				invitations={received}
				onOpenChange={setSelectionOpen}
				onSelect={setSelectedInvitationId}
				open={selectionOpen}
			/>
			{selectedInvitation ? (
				<DebtInvitationDialog
					invitation={selectedInvitation}
					onOpenChange={open => !open && setSelectedInvitationId(null)}
					onResolved={() => setSelectedInvitationId(null)}
					open
				/>
			) : null}
		</>
	);
}
