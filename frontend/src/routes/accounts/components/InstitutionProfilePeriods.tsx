import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { LuChevronDown, LuChevronUp, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { DialogBody, DialogFooter } from "@/components/ui/Dialog";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { putFinancialInstitutionsByIdProfilePeriods } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { carvePeriods, dayBefore, defaultGaps } from "./institution-period-timeline";

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

const formatDay = (date?: string | null) => (date ? date.split("-").reverse().join("/") : "");

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
	children,
	history,
	institutionId,
	onCancel,
	onSaved,
	profiles,
}: {
	children?: ReactNode;
	history: Change[];
	institutionId: string;
	onCancel: () => void;
	onSaved: () => void;
	profiles: Profile[];
}) {
	const client = useQueryClient();
	const [rows, setRows] = useState(() => periodsFromHistory(history, profiles));
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const fallback = profiles.find(profile => !profile.isDefault)?.id ?? profiles[0]?.id ?? "";
	const defaultName = profiles.find(profile => profile.isDefault)?.name ?? "Padrão";
	const update = (key: string, patch: Partial<InstitutionProfilePeriod>) =>
		setRows(current =>
			carvePeriods(
				current.map(row => (row.key === key ? { ...row, ...patch } : row)),
				key,
			),
		);
	const toggle = (key: string) =>
		setExpanded(current => {
			const next = new Set(current);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	const gaps = defaultGaps(rows);
	const timeline = [
		...rows.map(row => ({ kind: "period" as const, row, sortKey: row.startDate })),
		...gaps.map(gap => ({ gap, kind: "default" as const, sortKey: gap.startDate ?? "" })),
	].toSorted((a, b) => a.sortKey.localeCompare(b.sortKey));
	const invalid = rows.some(row => !row.profileId || !row.startDate);
	return (
		<>
			<DialogBody>
				{children}
				<div className="space-y-3">
					{timeline.map(item => {
						if (item.kind === "default") {
							const { gap } = item;
							return (
								<div className="rounded-xl border p-4" key={gap.key}>
									<p className="font-medium">{defaultName}</p>
									<p className="text-muted-foreground text-sm">
										{gap.startDate
											? `${formatDay(gap.startDate)} - `
											: "Desde o início - "}
										{gap.endDate ? formatDay(gap.endDate) : "em diante"}
									</p>
								</div>
							);
						}
						const { row } = item;
						const open = expanded.has(row.key);
						const profileName =
							profiles.find(profile => profile.id === row.profileId)?.name ?? "Perfil";
						return (
							<div className="space-y-4 rounded-xl border p-4" key={row.key}>
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate font-medium">{profileName}</p>
										<p className="text-muted-foreground text-sm">
											{formatDay(row.startDate)} -{" "}
											{row.endDate ? formatDay(row.endDate) : "em diante"}
										</p>
									</div>
									<Button
										aria-expanded={open}
										aria-label={open ? "Minimizar" : "Expandir"}
										className="shrink-0 cursor-pointer"
										onClick={() => toggle(row.key)}
										size="icon-sm"
										type="button"
										variant="outline"
									>
										{open ? <LuChevronUp /> : <LuChevronDown />}
									</Button>
								</div>
								{open && (
									<>
										<CustomSelect
											label="Perfil"
											onValueChange={profileId => update(row.key, { profileId })}
											options={profiles.map(profile => ({
												label: profile.name,
												value: profile.id,
											}))}
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
												onValueChange={endDate =>
													update(row.key, { endDate: endDate || null })
												}
												value={row.endDate ?? ""}
											/>
										</FormFieldRow>
										<Button
											onClick={() =>
												setRows(current =>
													current.filter(item => item.key !== row.key),
												)
											}
											size="sm"
											type="button"
											variant="outline"
										>
											<LuTrash2 /> Remover período
										</Button>
									</>
								)}
							</div>
						);
					})}
					<Button
						onClick={() => {
							const key = crypto.randomUUID();
							const today = new Date().toLocaleDateString("sv-SE");
							setRows(current =>
								carvePeriods(
									[
										...current,
										{ endDate: today, key, profileId: fallback, startDate: today },
									],
									key,
								),
							);
							setExpanded(current => new Set(current).add(key));
						}}
						size="sm"
						type="button"
						variant="outline"
					>
						<LuPlus /> Adicionar período
					</Button>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button onClick={onCancel} type="button" variant="outline">
					Cancelar
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
							run: () =>
								putFinancialInstitutionsByIdProfilePeriods({
									body: { periods },
									path: { id: institutionId },
								}).then(result => result.data),
							successMessage: "Períodos de perfil salvos.",
						});
					}}
					type="button"
				>
					Salvar
				</Button>
			</DialogFooter>
		</>
	);
}
