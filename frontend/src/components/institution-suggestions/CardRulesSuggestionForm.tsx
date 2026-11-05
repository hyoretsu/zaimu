import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultCardRules, type InstitutionCardRules } from "@zaimu/finance/institution-card-rules";
import { useState } from "react";
import { LuSend } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import {
	type FinancialInstitution,
	getFinancialInstitutionsByIdProfiles,
	postFinancialInstitutionsByIdCardRulesProposal,
} from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { useCacheIdentity } from "@/lib/query-cache";
import { InstitutionCardRuleFields } from "@/routes/admin/institutions/components/InstitutionCardRuleFields";
import { InstitutionPicker } from "./InstitutionPicker";

export interface CardRulesSuggestionDraft {
	institution: FinancialInstitution;
	scope: string;
	rules: InstitutionCardRules;
}

const INSTITUTION = "__institution__";

function CardRulesDraft({
	institution,
	onClose,
	recoveredCardRules,
}: {
	institution: FinancialInstitution;
	onClose: () => void;
	recoveredCardRules?: CardRulesSuggestionDraft;
}) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [scope, setScope] = useState(recoveredCardRules?.scope ?? INSTITUTION);
	const [rules, setRules] = useState<InstitutionCardRules>(
		recoveredCardRules?.rules ?? institution.creditCardRules ?? defaultCardRules,
	);
	const conflictKey = `institution-suggestion:card-rules:${institution.id}`;
	const pending = useModalRecoveryStore(state => !!state.pending[`${identity}:${conflictKey}`]);
	const profiles = useQuery({
		queryFn: () =>
			getFinancialInstitutionsByIdProfiles({ path: { id: institution.id } }).then(
				result => result.data,
			),
		queryKey: ["identity", identity, "institution-profiles", institution.id],
	});
	const choose = (id: string) => {
		const selected = profiles.data?.find(profile => profile.id === id)?.creditCardRules;
		setScope(id);
		setRules(selected ?? recoveredCardRules?.rules ?? institution.creditCardRules ?? defaultCardRules);
	};
	const reward = rules.cashback;
	const invalid =
		reward &&
		(reward.rate <= 0 ||
			(reward.conversionPoints !== null &&
				(!(reward.conversionPoints > 0) || !(reward.conversionAmount! > 0))) ||
			(reward.yieldPeriod !== null &&
				(!(reward.yieldReferenceRate! > 0) || !(reward.yieldReferencePercentage! > 0))));
	if (profiles.isPending) return <Skeleton className="h-40" />;
	if (profiles.isError) return <p role="alert">Não foi possível carregar os perfis.</p>;
	return (
		<fieldset className="grid min-w-0 gap-4" disabled={pending}>
			<CustomSelect
				label="Aplicar regras a"
				onValueChange={choose}
				options={[
					{ label: "Padrão da instituição", special: true, value: INSTITUTION },
					...(profiles.data ?? []).map(profile => ({ label: profile.name, value: profile.id })),
				]}
				placeholder="Ex: Padrão da instituição"
				searchable
				value={scope}
			/>
			<InstitutionCardRuleFields onChange={setRules} value={rules} />
			<ActionGroup>
				<Button
					disabled={pending || !!invalid}
					onClick={() => {
						const draft = { profileId: scope === INSTITUTION ? undefined : scope, rules };
						runBackgroundModalAction({
							cache: { client, operations: ["institution"] },
							close: onClose,
							conflictKey,
							failureMessage: "Não foi possível enviar a sugestão.",
							loadingMessage: "Enviando sugestão...",
							recovery: { entityId: institution.id, kind: conflictKey, payload: draft },
							run: () =>
								postFinancialInstitutionsByIdCardRulesProposal({
									body: draft,
									path: { id: institution.id },
								}).then(result => result.data),
							successMessage: "Regras de cartão sugeridas para revisão.",
						});
					}}
					type="button"
				>
					<LuSend />
					Enviar sugestão
				</Button>
			</ActionGroup>
		</fieldset>
	);
}

export function CardRulesSuggestionForm({
	onClose,
	recoveredCardRules,
}: {
	onClose: () => void;
	recoveredCardRules?: CardRulesSuggestionDraft;
}) {
	const [institution, setInstitution] = useState<FinancialInstitution | undefined>(
		recoveredCardRules?.institution,
	);
	return (
		<div className="grid gap-3">
			<InstitutionPicker
				filter={item => item.status === "APPROVED"}
				onChange={setInstitution}
				value={institution?.id}
			/>
			{institution && (
				<CardRulesDraft
					institution={institution}
					key={institution.id}
					onClose={onClose}
					recoveredCardRules={
						recoveredCardRules?.institution.id === institution.id ? recoveredCardRules : undefined
					}
				/>
			)}
		</div>
	);
}
