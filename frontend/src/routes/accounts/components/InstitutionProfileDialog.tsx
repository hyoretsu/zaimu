import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuUserRoundCog } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { FinancialInstitution } from "@/lib/api";
import { getFinancialInstitutionsByIdProfileHistory, getFinancialInstitutionsByIdProfiles } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { InstitutionMergeProposal } from "./InstitutionMergeProposal";
import { InstitutionProfilePeriods } from "./InstitutionProfilePeriods";

export function InstitutionProfileDialog({ institution }: { institution: FinancialInstitution }) {
	const [open, setOpen] = useState(false);
	const [mergeTarget, setMergeTarget] = useState<string>();
	const userId = useAuthStore(state => state.user?.id);
	const guest = useAuthStore(state => state.isGuestMode);
	const profiles = useQuery({
		enabled: open && !guest,
		queryFn: () =>
			getFinancialInstitutionsByIdProfiles({ path: { id: institution.id } }).then(
				result => result.data,
			),
		queryKey: ["institution-profiles", userId, institution.id],
	});
	const history = useQuery({
		enabled: open && !guest,
		queryFn: () =>
			getFinancialInstitutionsByIdProfileHistory({ path: { id: institution.id } }).then(
				result => result.data,
			),
		queryKey: ["institution-profile-history", userId, institution.id],
	});
	const changeOpen = (next: boolean) => {
		setOpen(next);
		if (!next) setMergeTarget(undefined);
	};
	useBackgroundModalRecovery<{ target?: string }>(`institution-profile:${institution.id}`, entry => {
		setMergeTarget(entry.payload.target);
		setOpen(true);
	});
	return (
		<Dialog onOpenChange={changeOpen} open={open}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							aria-label={`Perfil de ${institution.name}`}
							className="cursor-pointer"
							size="icon-sm"
							variant="outline"
						>
							<LuUserRoundCog />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Escolher perfil da instituição</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Perfil de {institution.name}</DialogTitle>
					<DialogDescription>
						Salvar recalcula o rendimento das contas desta instituição a partir do primeiro dia
						afetado.
					</DialogDescription>
				</DialogHeader>
				{guest ? (
					<DialogBody>
						<p>Perfis institucionais exigem conexão e conta do Zaimu.</p>
					</DialogBody>
				) : profiles.isPending || history.isPending ? (
					<DialogBody>
						<div className="space-y-3">
							<Skeleton className="h-20 w-full" />
							<Skeleton className="h-20 w-full" />
						</div>
					</DialogBody>
				) : profiles.isError || history.isError ? (
					<DialogBody>
						<p role="alert">{profiles.error?.message ?? history.error?.message}</p>
					</DialogBody>
				) : (
					<InstitutionProfilePeriods
						history={history.data ?? []}
						institutionId={institution.id}
						key={history.dataUpdatedAt}
						onCancel={() => changeOpen(false)}
						onSaved={() => changeOpen(false)}
						profiles={profiles.data ?? []}
					>
						<InstitutionMergeProposal
							initialTarget={mergeTarget}
							institution={institution}
							onClose={() => changeOpen(false)}
						/>
					</InstitutionProfilePeriods>
				)}
			</DialogContent>
		</Dialog>
	);
}
