import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DebtInvitation } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { DebtInvitationAssociationDialog } from "./DebtInvitationAssociationDialog";
import { DebtInvitationDeclineDialog } from "./DebtInvitationDeclineDialog";
import { DebtInvitationPreview } from "./DebtInvitationPreview";

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
	const preview = useQuery({
		enabled: open && identity !== null,
		queryFn: () => dataService.debts.getInvitationPreview(invitation.id),
		queryKey: [...queryKeys.debts.invitations(identity!), invitation.id, "preview"],
	});
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
				{preview.isPending ? (
					<div className="space-y-4">
						<Skeleton className="h-20 rounded-2xl" />
						{[0, 1, 2].map(index => (
							<Skeleton className="h-16 rounded-xl" key={index} />
						))}
					</div>
				) : preview.isError ? (
					<div className="space-y-3 rounded-xl border p-4">
						<p className="text-sm">Não foi possível carregar os lançamentos.</p>
						<Button
							className="cursor-pointer"
							onClick={() => preview.refetch()}
							type="button"
							variant="outline"
						>
							Tentar novamente
						</Button>
					</div>
				) : preview.isSuccess ? (
					<DebtInvitationPreview counterpartyName={invitation.counterpartyName} preview={preview.data} />
				) : null}
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
