import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { putFinancialInstitutionsByIdProfilePeriods } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";

interface Change {
	effectiveDate: string;
	profileId: string;
}
interface Profile {
	id: string;
	isDefault: boolean;
	name: string;
}
interface InstitutionProfilePeriod {
	endDate?: string | null;
	profileId: string;
	startDate: string;
}
type Row = InstitutionProfilePeriod & { key: string };

const dayBefore = (date: string) => {
	const day = new Date(`${date.slice(0, 10)}T12:00:00Z`);
	day.setUTCDate(day.getUTCDate() - 1);
	return day.toISOString().slice(0, 10);
};

/** Non-default stretches of the stored timeline; default fills every gap implicitly. */
function periodsFromHistory(history: Change[], profiles: Profile[]): Row[] {
	const sorted = history.toSorted((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
	return sorted.flatMap((change, index) => {
		if (profiles.find(profile => profile.id === change.profileId)?.isDefault) return [];
		const next = sorted[index + 1];
		return [
			{
				endDate: next ? dayBefore(next.effectiveDate) : null,
				key: crypto.randomUUID(),
				profileId: change.profileId,
				startDate: change.effectiveDate.slice(0, 10),
			},
		];
	});
}

export function InstitutionProfilePeriods({
	history,
	institutionId,
	onSaved,
	profiles,
}: {
	history: Change[];
	institutionId: string;
	onSaved: () => void;
	profiles: Profile[];
}) {
	const client = useQueryClient();
	const [rows, setRows] = useState(() => periodsFromHistory(history, profiles));
	const fallback = profiles.find(profile => !profile.isDefault)?.id ?? profiles[0]?.id ?? "";
	const defaultName = profiles.find(profile => profile.isDefault)?.name ?? "Padrão";
	const update = (key: string, patch: Partial<InstitutionProfilePeriod>) =>
		setRows(current => current.map(row => (row.key === key ? { ...row, ...patch } : row)));
	const invalid = rows.some(row => !row.profileId || !row.startDate);
	return (
		<div className="space-y-3">
			<h3 className="font-semibold">Períodos de perfil</h3>
			<p className="text-muted-foreground text-sm">
				Fora dos períodos abaixo vale o perfil {defaultName}. Salvar recalcula o rendimento das contas
				desta instituição a partir do primeiro dia afetado.
			</p>
			{rows.map(row => (
				<div className="space-y-2 rounded-xl border p-3" key={row.key}>
					<CustomSelect
						label="Perfil"
						onValueChange={profileId => update(row.key, { profileId })}
						options={profiles.map(profile => ({ label: profile.name, value: profile.id }))}
						placeholder="Ex: Meli+"
						required
						value={row.profileId}
					/>
					<FormFieldRow>
						<DateField
							id={`period-start-${row.key}`}
							label="De"
							name={`period-start-${row.key}`}
							onValueChange={startDate => update(row.key, { startDate })}
							required
							value={row.startDate}
						/>
						<DateField
							description="Vazio = até hoje e adiante"
							id={`period-end-${row.key}`}
							label="Até"
							min={row.startDate}
							name={`period-end-${row.key}`}
							onValueChange={endDate => update(row.key, { endDate: endDate || null })}
							value={row.endDate ?? ""}
						/>
					</FormFieldRow>
					<Button
						onClick={() => setRows(current => current.filter(item => item.key !== row.key))}
						size="sm"
						type="button"
						variant="outline"
					>
						<LuTrash2 /> Remover período
					</Button>
				</div>
			))}
			<div className="flex flex-wrap gap-2">
				<Button
					onClick={() =>
						setRows(current => [
							...current,
							{
								endDate: null,
								key: crypto.randomUUID(),
								profileId: fallback,
								startDate: new Date().toLocaleDateString("sv-SE"),
							},
						])
					}
					size="sm"
					type="button"
					variant="outline"
				>
					<LuPlus /> Adicionar período
				</Button>
				<Button
					disabled={invalid}
					onClick={() => {
						const periods = rows.map(({ key: _key, ...period }) => period);
						runBackgroundModalAction({
							cache: { client, operations: ["institution", "account"] },
							close: onSaved,
							conflictKey: `institution-periods:${institutionId}`,
							failureMessage: "Não foi possível salvar os períodos de perfil.",
							loadingMessage: "Salvando períodos e recalculando rendimento...",
							recovery: {
								entityId: institutionId,
								kind: `institution-periods:${institutionId}`,
								payload: {},
							},
							run: () => putFinancialInstitutionsByIdProfilePeriods(institutionId, { periods }),
							successMessage: "Períodos de perfil salvos.",
						});
					}}
					size="sm"
					type="button"
				>
					Salvar períodos
				</Button>
			</div>
		</div>
	);
}
