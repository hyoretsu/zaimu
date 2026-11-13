import { defaultCardRules } from "@zaimu/finance/institution-card-rules";
import { useState } from "react";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CollapsibleFormSection } from "@/components/ui/CollapsibleFormSection";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cardRulesSummary } from "./card-rules-summary";
import { InstitutionCardRuleFields } from "./InstitutionCardRuleFields";
import type { ExistingProfile, InstitutionFormState } from "./types";

const INSTITUTION = "__institution__";

export function CardRulesSection({
	disabled,
	onChange,
	profiles,
	state,
}: {
	disabled: boolean;
	onChange: (patch: Partial<InstitutionFormState>) => void;
	profiles: ExistingProfile[];
	state: InstitutionFormState;
}) {
	const [scope, setScope] = useState(INSTITUTION);
	const editable = profiles.filter(profile => !profile.isDefault);
	const existing = editable.find(profile => profile.id === scope);
	const created = state.newProfiles.find(profile => profile.key === scope);
	const activeScope = existing || created ? scope : INSTITUTION;
	const profileRules = existing
		? existing.id in state.profileRules
			? state.profileRules[existing.id]
			: existing.creditCardRules
		: created?.rules;
	const setProfileRules = (rules: typeof profileRules) => {
		if (existing) onChange({ profileRules: { ...state.profileRules, [existing.id]: rules ?? null } });
		else if (created)
			onChange({
				newProfiles: state.newProfiles.map(profile =>
					profile.key === created.key ? { ...profile, rules: rules ?? null } : profile,
				),
			});
	};
	const own = [
		...editable.filter(profile =>
			profile.id in state.profileRules ? state.profileRules[profile.id] : profile.creditCardRules,
		),
		...state.newProfiles.filter(profile => profile.rules),
	].length;
	const profileOptions = [
		...editable.map(profile => ({ label: profile.name, value: profile.id })),
		...state.newProfiles.map(profile => ({
			label: `${profile.name.trim() || "Novo perfil"} (novo)`,
			value: profile.key,
		})),
	];
	return (
		<CollapsibleFormSection
			summary={`Padrão: ${cardRulesSummary(state.rules)}${own ? ` - ${own} ${own === 1 ? "perfil" : "perfis"} com regras próprias` : ""}`}
			title="Regras de cartão"
		>
			<fieldset className="grid min-w-0 gap-4" disabled={disabled}>
				{profileOptions.length > 0 && (
					<CustomSelect
						label="Aplicar regras a"
						onValueChange={value => setScope(value || INSTITUTION)}
						options={[
							{ label: "Padrão da instituição", special: true, value: INSTITUTION },
							...profileOptions,
						]}
						placeholder="Ex: Padrão da instituição"
						searchable
						value={activeScope}
					/>
				)}
				{activeScope === INSTITUTION ? (
					<InstitutionCardRuleFields onChange={rules => onChange({ rules })} value={state.rules} />
				) : (
					<>
						<CheckboxField
							checkboxProps={{
								checked: !!profileRules,
								onCheckedChange: checked =>
									setProfileRules(checked === true ? (profileRules ?? state.rules) : null),
							}}
						>
							Usar regras próprias neste perfil
						</CheckboxField>
						{profileRules ? (
							<InstitutionCardRuleFields
								onChange={setProfileRules}
								value={profileRules ?? defaultCardRules}
							/>
						) : (
							<p className="text-muted-foreground text-sm">
								Sem regras próprias, o perfil segue as regras do padrão da instituição.
							</p>
						)}
					</>
				)}
			</fieldset>
		</CollapsibleFormSection>
	);
}
