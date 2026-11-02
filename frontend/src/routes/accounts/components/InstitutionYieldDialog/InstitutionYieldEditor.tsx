import { useQuery } from "@tanstack/react-query";
import { countryCurrency } from "@zaimu/finance/currency-preference";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { DialogBody } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import {
	type FinancialInstitution,
	type FinancialInstitutionYieldPolicy,
	getFinancialInstitutionsByIdPolicies,
	getFinancialInstitutionsByIdProfiles,
} from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
import { CreateInstitutionProfileDialog } from "./CreateInstitutionProfileDialog";
import { InstitutionYieldPolicyForm } from "./InstitutionYieldPolicyForm";
import { InstitutionYieldTimeline } from "./InstitutionYieldTimeline";
import { selectEditablePolicy } from "./policy-selection";

export function InstitutionYieldEditor({
	institution,
	onClose,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onClose: () => void;
	onUpdate: (
		institution: FinancialInstitution,
		policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
	) => Promise<unknown>;
}) {
	const [profileId, setProfile] = useState<string>();
	const [requestedProfileName, setRequestedProfileName] = useState<string>();
	const [countryCode, setCountry] = useState<string | undefined>(
		institution.operatingCountryCodes?.length === 1 ? institution.operatingCountryCodes[0] : undefined,
	);
	const [effectiveDate, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
	const identity = useCacheIdentity();
	const preferredCurrency = useCurrencyStore(state => state.currency);
	const currencies = useCurrencyStore(state => state.currencies);
	const currency = (countryCode ? countryCurrency(countryCode, currencies) : null) ?? preferredCurrency;
	const profiles = useQuery({
		queryFn: () => getFinancialInstitutionsByIdProfiles(institution.id),
		queryKey: ["identity", identity, "institution-profiles", institution.id],
	});
	const policies = useQuery({
		queryFn: () => getFinancialInstitutionsByIdPolicies(institution.id),
		queryKey: ["identity", identity, "institution-policies", institution.id],
	});
	const selectedProfile =
		profileId ??
		profiles.data?.find(profile => profile.name === requestedProfileName)?.id ??
		profiles.data?.find(profile => profile.isDefault)?.id;
	const policy = selectEditablePolicy(
		policies.data ?? [],
		selectedProfile,
		countryCode,
		effectiveDate,
		currency,
	);
	const names = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "region" });
	const controls = (
		<>
			<CustomSelect
				label="Perfil da política"
				onValueChange={value => setProfile(value || undefined)}
				options={(profiles.data ?? []).map(profile => ({ label: profile.name, value: profile.id }))}
				placeholder="Ex: Padrão"
				required
				searchable
				value={selectedProfile}
			/>
			<CreateInstitutionProfileDialog
				institutionId={institution.id}
				onCreated={async name => {
					setRequestedProfileName(name);
					setProfile(undefined);
					await profiles.refetch();
				}}
			/>
			<CustomSelect
				label="País aplicável"
				onValueChange={value => setCountry(!value || value === "__all__" ? undefined : value)}
				options={[
					{ label: "Todos os países", special: true, value: "__all__" },
					...(institution.operatingCountryCodes ?? []).map(value => ({
						label: names.of(value) ?? value,
						value,
					})),
				]}
				placeholder="Todos os países"
				searchable
				value={countryCode ?? "__all__"}
			/>
			<DateField
				id="policy-effective-date"
				label="Vigente desde"
				name="policy-effective-date"
				onValueChange={setDate}
				required
				value={effectiveDate}
			/>
			<InstitutionYieldTimeline
				countryCode={countryCode}
				currency={currency}
				policies={policies.data ?? []}
				profileId={selectedProfile}
			/>
			<p className="text-muted-foreground text-sm">
				Proposta entra em vigor somente após aprovação administrativa.
			</p>
		</>
	);
	let content: ReactNode;
	if (profiles.isPending || policies.isPending) {
		content = (
			<DialogBody>
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
				<Skeleton className="h-72" />
			</DialogBody>
		);
	} else if (profiles.isError || policies.isError) {
		content = (
			<DialogBody>
				<p role="alert">Não foi possível carregar a configuração.</p>
				<Button
					onClick={() => {
						void profiles.refetch();
						void policies.refetch();
					}}
					variant="outline"
				>
					Tentar novamente
				</Button>
			</DialogBody>
		);
	} else if (!selectedProfile) {
		content = (
			<DialogBody>
				<p role="alert">
					Perfil Padrão indisponível. Atualize o catálogo antes de configurar rendimento.
				</p>
			</DialogBody>
		);
	} else {
		content = (
			<InstitutionYieldPolicyForm
				controls={controls}
				currency={currency}
				key={`${selectedProfile}:${countryCode}`}
				onDiscard={onClose}
				onSave={async body => {
					if (!selectedProfile || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
						throw new Error("Selecione perfil e data de vigência.");
					}
					await onUpdate(institution, {
						...body,
						countryCode,
						effectiveUntil: policy?.effectiveUntil ?? undefined,
						profileId: selectedProfile,
						requestedEffectiveDate: effectiveDate,
					});
					await policies.refetch();
					onClose();
				}}
				policy={policy}
			/>
		);
	}
	return content;
}
