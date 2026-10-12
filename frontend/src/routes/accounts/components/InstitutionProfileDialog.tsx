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
import type { FinancialInstitution } from "@/lib/api";
import { fetchWithAuth } from "@/lib/dataService";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { InstitutionMergeProposal } from "./InstitutionMergeProposal";
import { ProfileProposalForm } from "./ProfileProposalForm";

interface Profile {
	id: string;
	name: string;
	isDefault: boolean;
}
interface Change {
	id: string;
	name: string;
	profileId: string;
	effectiveDate: string;
}
export function InstitutionProfileDialog({ institution }: { institution: FinancialInstitution }) {
	const [open, setOpen] = useState(false);
	const [profileId, setProfile] = useState<string>();
	const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
	const [saving, setSaving] = useState(false);
	const userId = useAuthStore(state => state.user?.id);
	const guest = useAuthStore(state => state.isGuestMode);
	const client = useQueryClient();
	const identity = useCacheIdentity();
	const profiles = useQuery({
		enabled: open && !guest,
		queryFn: () => fetchWithAuth<Profile[]>(`/financial-institutions/${institution.id}/profiles`),
		queryKey: ["institution-profiles", userId, institution.id],
	});
	const history = useQuery({
		enabled: open && !guest,
		queryFn: () => fetchWithAuth<Change[]>(`/financial-institutions/${institution.id}/profile-history`),
		queryKey: ["institution-profile-history", userId, institution.id],
	});
	const selected = profileId ?? profiles.data?.find(profile => profile.isDefault)?.id;
	return (
		<Dialog onOpenChange={setOpen} open={open}>
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
						setSaving(true);
						void fetchWithAuth(`/financial-institutions/${institution.id}/profile-history`, {
							body: JSON.stringify({ effectiveDate: date, profileId: selected }),
							method: "POST",
						})
							.then(async () => {
								await Promise.all([
									history.refetch(),
									identity ? invalidateCacheOperation(client, identity, "account") : Promise.resolve(),
								]);
								showToast("Mudança de perfil registrada", "positive");
								setOpen(false);
							})
							.catch(error => showToast(error.message, "negative"))
							.finally(() => setSaving(false));
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
								<ProfileProposalForm institutionId={institution.id} />
								<InstitutionMergeProposal institution={institution} />
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
						<Button onClick={() => setOpen(false)} type="button" variant="outline">
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
