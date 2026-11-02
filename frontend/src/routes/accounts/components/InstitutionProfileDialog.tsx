import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuHistory } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
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
		queryFn: () => getFinancialInstitutionsByIdProfiles(institution.id),
		queryKey: ["institution-profiles", userId, institution.id],
	});
	const history = useQuery({
		enabled: open && !guest,
		queryFn: () => getFinancialInstitutionsByIdProfileHistory(institution.id),
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
							<LuHistory />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Perfil e histórico</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Perfil de {institution.name}</DialogTitle>
				</DialogHeader>
				<div className="flex min-h-0 flex-1 flex-col gap-4">
					<DialogBody>
						{guest ? (
							<p>Perfis institucionais exigem conexão e conta do Zaimu.</p>
						) : profiles.isPending || history.isPending ? (
							<div className="space-y-3">
								<Skeleton className="h-11 w-full" />
								<Skeleton className="h-11 w-full" />
								<Skeleton className="h-24 w-full" />
							</div>
						) : profiles.isError || history.isError ? (
							<p role="alert">{profiles.error?.message ?? history.error?.message}</p>
						) : (
							<>
								<InstitutionMergeProposal
									initialTarget={mergeTarget}
									institution={institution}
									onClose={() => changeOpen(false)}
								/>
								<InstitutionProfilePeriods
									history={history.data ?? []}
									institutionId={institution.id}
									key={history.dataUpdatedAt}
									onSaved={() => changeOpen(false)}
									profiles={profiles.data ?? []}
								/>
								<div className="space-y-2">
									<h3 className="font-semibold">Histórico</h3>
									<p className="text-muted-foreground text-sm">
										Padrão vale antes da primeira mudança.
									</p>
									{history.data?.map(change => (
										<p className="rounded-xl border p-3 text-sm" key={change.id}>
											{change.effectiveDate.slice(0, 10)} - {change.name}
											{change.effectiveDate.slice(0, 10) >
											new Date().toLocaleDateString("sv-SE")
												? " - Agendada"
												: ""}
										</p>
									))}
									{!history.data?.length && (
										<p className="text-sm">Nenhuma mudança registrada.</p>
									)}
								</div>
							</>
						)}
					</DialogBody>
					<DialogFooter>
						<Button onClick={() => changeOpen(false)} type="button" variant="outline">
							Fechar
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
