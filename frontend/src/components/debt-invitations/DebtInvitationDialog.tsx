import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DebtInvitation, DebtInvitationPreview as InvitationPreview } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
export interface InvitationRecovery {
	invitation: DebtInvitation;
	step: "association" | "decline";
	personId?: string;
}

import { DebtInvitationAssociationDialog } from "./DebtInvitationAssociationDialog";
import { DebtInvitationDeclineDialog } from "./DebtInvitationDeclineDialog";
import { DebtInvitationPreview } from "./DebtInvitationPreview";

export function DebtInvitationDialog({
	invitation,
	onOpenChange,
	open,
	recovery,
}: {
	invitation: DebtInvitation;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	recovery?: InvitationRecovery;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const preview = useInfiniteQuery({
		enabled: open && identity !== null,
		getNextPageParam: (last: InvitationPreview) =>
			last.hasMore ? (last.nextCursor ?? undefined) : undefined,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }): Promise<InvitationPreview> =>
			dataService.debts.getInvitationPreview(invitation.id, pageParam),
		queryKey: [...queryKeys.debts.invitations(identity!), invitation.id, "preview"],
	});
	const [step, setStep] = useState<"details" | "association" | "decline">(recovery?.step ?? "details");
	const isPending = useModalRecoveryStore(
		state => !!state.pending[`${identity}:debt-invitation:${invitation.id}`],
	);
	const submit = (action: "association" | "decline", personId?: string) =>
		runBackgroundModalAction({
			close: () => onOpenChange(false),
			conflictKey: `debt-invitation:${invitation.id}`,
			failureMessage: "Não foi possível resolver convite.",
			loadingMessage: "Atualizando convite...",
			onSuccess: async () => {
				if (identity) await invalidateCacheOperation(queryClient, identity, "invitation");
			},
			recovery: {
				entityId: invitation.id,
				kind: "debt-invitation",
				payload: { invitation, personId, step: action },
			},
			run: () =>
				action === "association"
					? dataService.debts.acceptInvitation(invitation.id, personId)
					: dataService.debts.declineInvitation(invitation.id),
			successMessage: action === "association" ? "Pessoa associada." : "Convite recusado.",
		});

	const returnToDetails = () => setStep("details");
	const dismissInvitation = () => onOpenChange(false);
	return step === "association" ? (
		<DebtInvitationAssociationDialog
			initialPersonId={recovery?.personId}
			onApprove={personId => submit("association", personId)}
			onOpenChange={nextOpen => (nextOpen ? setStep("association") : returnToDetails())}
			open
			pending={isPending}
		/>
	) : step === "decline" ? (
		<DebtInvitationDeclineDialog
			onDecline={() => submit("decline")}
			onDismiss={dismissInvitation}
			open
			pending={isPending}
		/>
	) : (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="gap-4 p-4 sm:max-w-lg sm:p-6">
				<DialogHeader>
					<DialogTitle>{invitation.counterpartyName} quer compartilhar uma dívida</DialogTitle>
					<DialogDescription>
						Confira os lançamentos atuais. Ao aceitar, o saldo e o histórico ficam visíveis nos dois lados.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					{preview.isPending ? (
						<div className="space-y-4" role="status">
							<Skeleton className="h-20 rounded-2xl" />
							{[0, 1, 2].map(index => (
								<Skeleton className="h-16 rounded-xl" key={index} />
							))}
						</div>
					) : preview.isError && !preview.data ? (
						<div className="space-y-3 rounded-xl border p-4">
							<p className="text-sm">Não foi possível carregar os lançamentos.</p>
							<ActionGroup>
								<Button
									className="cursor-pointer"
									onClick={() => preview.refetch()}
									type="button"
									variant="outline"
								>
									Tentar novamente
								</Button>
							</ActionGroup>
						</div>
					) : preview.data ? (
						<DebtInvitationPreview
							counterpartyName={invitation.counterpartyName}
							hasMore={preview.hasNextPage}
							loadingMore={preview.isFetchingNextPage}
							loadMore={() => preview.fetchNextPage()}
							loadMoreError={preview.isFetchNextPageError}
							preview={{ ...preview.data.pages[0]!, items: preview.data.pages.flatMap(page => page.items) }}
						/>
					) : null}
				</DialogBody>
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
						disabled={isPending || !preview.isSuccess}
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
