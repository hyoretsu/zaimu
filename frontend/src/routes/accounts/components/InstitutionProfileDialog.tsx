import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuHistory } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { FinancialInstitution } from "@/lib/api";
import {
	getFinancialInstitutionsByIdProfileHistory,
	getFinancialInstitutionsByIdProfiles,
	postFinancialInstitutionsByIdProfileHistory,
} from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { useCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth";
import { InstitutionMergeProposal } from "./InstitutionMergeProposal";

export function InstitutionProfileDialog({ institution }: { institution: FinancialInstitution }) {
	const [open, setOpen] = useState(false);
	const [profileId, setProfile] = useState<string>();
	const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
	const pending = useModalRecoveryStore(state => state.pending);
	const [mergeTarget, setMergeTarget] = useState<string>();
	const userId = useAuthStore(state => state.user?.id);
	const guest = useAuthStore(state => state.isGuestMode);
	const client = useQueryClient();
	const identity = useCacheIdentity();
	const saving = !!pending[`${identity}:institution-profile:${institution.id}`];
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
	const today = new Date().toLocaleDateString("sv-SE");
	const active = history.data
		?.filter(change => change.effectiveDate.slice(0, 10) <= today)
		.toSorted((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
		.at(-1);
	const selected = profileId ?? active?.profileId ?? profiles.data?.find(profile => profile.isDefault)?.id;
	const changeOpen = (next: boolean) => {
		setOpen(next);
		if (!next) {
			setProfile(undefined);
			setMergeTarget(undefined);
			setDate(new Date().toLocaleDateString("sv-SE"));
		}
	};
	useBackgroundModalRecovery<{ date?: string; profileId?: string; name?: string; target?: string }>(
		`institution-profile:${institution.id}`,
		entry => {
			setDate(entry.payload.date ?? today);
			setProfile(entry.payload.profileId);
			setMergeTarget(entry.payload.target);
			setOpen(true);
		},
	);
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
					<DialogDescription>
						Mudança vale para todas as suas contas nesta instituição. Ajustes próprios têm prioridade.
						Cancelamento previsto exige nova mudança para Padrão.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={event => {
						event.preventDefault();
						if (!selected || !date) return;
						const draft = { date, profileId: selected };
						runBackgroundModalAction({
							cache: { client, operations: ["institution"] },
							close: () => changeOpen(false),
							conflictKey: `institution-profile:${institution.id}`,
							failureMessage: "Não foi possível registrar mudança de perfil.",
							loadingMessage: "Registrando mudança de perfil...",
							recovery: {
								entityId: institution.id,
								kind: `institution-profile:${institution.id}`,
								payload: draft,
							},
							run: () =>
								postFinancialInstitutionsByIdProfileHistory(institution.id, {
									effectiveDate: draft.date,
									profileId: draft.profileId,
								}),
							successMessage: "Mudança de perfil registrada.",
						});
					}}
				>
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
								<FormFieldRow>
									<CustomSelect
										label="Perfil"
										onValueChange={setProfile}
										options={(profiles.data ?? []).map(profile => ({
											label: profile.name,
											value: profile.id,
										}))}
										placeholder="Ex: Padrão"
										required
										searchable
										value={selected}
									/>
									<DateField
										id="institution-profile-date"
										label="Vigente desde"
										name="profile-effective-date"
										onValueChange={setDate}
										required
										value={date}
									/>
								</FormFieldRow>
								<InstitutionMergeProposal
									initialTarget={mergeTarget}
									institution={institution}
									onClose={() => changeOpen(false)}
								/>
								<div className="space-y-2">
									<h3 className="font-semibold">Histórico</h3>
									<p className="text-muted-foreground text-sm">Padrão vale antes da primeira mudança.</p>
									{history.data?.map(change => (
										<p className="rounded-xl border p-3 text-sm" key={change.id}>
											{change.effectiveDate.slice(0, 10)} - {change.name}
											{change.effectiveDate.slice(0, 10) > new Date().toLocaleDateString("sv-SE")
												? " - Agendada"
												: ""}
										</p>
									))}
									{!history.data?.length && <p className="text-sm">Nenhuma mudança registrada.</p>}
								</div>
							</>
						)}
					</DialogBody>
					<DialogFooter>
						<Button onClick={() => changeOpen(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button disabled={saving || guest || !selected || !date} type="submit">
							{saving ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
