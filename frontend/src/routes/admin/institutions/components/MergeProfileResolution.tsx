import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
export interface ProfileResolution {
	profileId: string;
	effectiveDate: string;
}
export function MergeProfileResolution({
	targetId,
	proposalId,
	value,
	onChange,
}: {
	targetId: string;
	proposalId: string;
	value: ProfileResolution[] | undefined;
	onChange: (value: ProfileResolution[]) => void;
}) {
	const [profile, setProfile] = useState<string>();
	const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
	const profiles = useQuery({
		queryFn: () =>
			fetchWithAuth<{ id: string; name: string }[]>(`/financial-institutions/${targetId}/profiles`),
		queryKey: ["merge-profiles", targetId],
	});
	const history = useQuery({
		queryFn: () =>
			fetchWithAuth<{ institutionId: string; name: string; effectiveDate: string }[]>(
				`/financial-institutions/review/proposals/${proposalId}/profile-history?targetId=${targetId}`,
			),
		queryKey: ["merge-history", proposalId, targetId],
	});
	return (
		<div className="grid gap-3 rounded-xl border p-3">
			<h4 className="font-semibold">Resolução explícita do histórico</h4>
			<p className="text-muted-foreground text-sm">
				Históricos anteriores ficam na auditoria. Escolha mudanças do vínculo final; Padrão vale antes da
				primeira mudança.
			</p>
			{history.data?.map((change, index) => (
				<p className="text-sm" key={`${change.institutionId}:${index}`}>
					{change.effectiveDate.slice(0, 10)} - {change.name}
				</p>
			))}
			<CustomSelect
				label="Perfil final"
				onValueChange={setProfile}
				options={(profiles.data ?? []).map(item => ({ label: item.name, value: item.id }))}
				placeholder="Ex: Padrão"
				searchable
				value={profile}
			/>
			<DateField
				id={`merge-date-${proposalId}`}
				label="Vigente desde"
				name="merge-profile-date"
				onValueChange={setDate}
				value={date}
			/>
			<ActionGroup>
				<Button
					onClick={() => {
						onChange([]);
						showToast("Resolução definida: Padrão em todo o período", "info");
					}}
					variant="outline"
				>
					Usar somente Padrão
				</Button>
				<Button
					disabled={!profile || !date}
					onClick={() => {
						onChange(
							[
								...(value ?? []).filter(change => change.effectiveDate !== date),
								{ effectiveDate: date, profileId: profile! },
							].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
						);
						showToast("Mudança incluída na resolução", "info");
					}}
					variant="outline"
				>
					<LuPlus />
					Adicionar mudança
				</Button>
			</ActionGroup>
			{value?.map(change => (
				<p className="text-sm" key={change.effectiveDate}>
					Final: {change.effectiveDate} - {profiles.data?.find(item => item.id === change.profileId)?.name}
				</p>
			))}
			{value && !value.length && <p className="text-sm">Final: Padrão em todo o período.</p>}
		</div>
	);
}
