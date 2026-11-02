import { useQuery } from "@tanstack/react-query";
import { countryCurrency } from "@zaimu/finance/currency-preference";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
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
import {
	OPEN_START,
	policyDay,
	policyTimeline,
	selectEditablePolicy,
	visibleStart,
} from "./policy-selection";

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
	const [countryCode, setCountry] = useState<string>();
	const today = new Date().toLocaleDateString("sv-SE");
	// Blank start means "the whole previous period" (stored as the open start sentinel).
	const [effectiveDate, setDate] = useState("");
	// Resolve the source period independently of the draft's editable start date.
	const [sourceDate, setSourceDate] = useState(today);
	const [effectiveUntil, setUntil] = useState("");
	// Start date of the existing period being edited; unset while a new period is created.
	const [editingStart, setEditingStart] = useState<string>();
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
	const timeline = policyTimeline(policies.data ?? [], selectedProfile, countryCode, currency);
	const editedPolicy = editingStart
		? timeline.find(item => policyDay(item.effectiveDate) === editingStart)
		: undefined;
	const replacesEffectiveDate = editedPolicy ? editingStart : undefined;
	const policy =
		editedPolicy ??
		selectEditablePolicy(policies.data ?? [], selectedProfile, countryCode, sourceDate, currency);
	const names = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "region" });
	const controls = (
		<>
			<CustomSelect
				label="Perfil da política"
				onValueChange={value => {
					const nextProfile = value || undefined;
					const nextPolicy = selectEditablePolicy(
						policies.data ?? [],
						nextProfile,
						countryCode,
						today,
						currency,
					);
					setProfile(nextProfile);
					setEditingStart(undefined);
					setSourceDate(today);
					setDate(nextPolicy ? visibleStart(nextPolicy.effectiveDate) : "");
					setUntil(nextPolicy?.effectiveUntil ? policyDay(nextPolicy.effectiveUntil) : "");
				}}
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
					setEditingStart(undefined);
					setSourceDate(today);
					setUntil("");
					await profiles.refetch();
				}}
			/>
			<CustomSelect
				label="País aplicável"
				onValueChange={value => {
					setCountry(!value || value === "__all__" ? undefined : value);
					setEditingStart(undefined);
					setSourceDate(today);
					setUntil("");
				}}
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
			<div className="grid gap-2">
				<span className="text-sm font-medium">Período de vigência</span>
				<DateRangePicker
					onChange={({ endDate, startDate }) => {
						setDate(startDate ?? "");
						setUntil(endDate ?? "");
					}}
					triggerLabel={
						!effectiveDate && !effectiveUntil ? "Todo o período anterior, sem fim" : undefined
					}
					value={{ endDate: effectiveUntil || undefined, startDate: effectiveDate || undefined }}
				/>
				<p className="text-muted-foreground text-xs">
					Opcional. Sem início, vale desde todo o período anterior; sem fim, vale até a próxima
					mudança.
				</p>
			</div>
			<InstitutionYieldTimeline
				countryCode={countryCode}
				currency={currency}
				onNew={() => {
					setEditingStart(undefined);
					setSourceDate(effectiveDate || today);
					setUntil("");
				}}
				onSelect={item => {
					setEditingStart(policyDay(item.effectiveDate));
					setDate(visibleStart(item.effectiveDate));
					setUntil(item.effectiveUntil ? policyDay(item.effectiveUntil) : "");
				}}
				policies={policies.data ?? []}
				profileId={selectedProfile}
				selectedStart={replacesEffectiveDate}
			/>
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
				key={`${selectedProfile}:${countryCode}:${replacesEffectiveDate ?? ""}`}
				onDiscard={onClose}
				onSave={async body => {
					if (!selectedProfile) throw new Error("Selecione o perfil.");
					const startDate = effectiveDate || OPEN_START;
					if (effectiveUntil && effectiveUntil <= startDate)
						throw new Error("O fim da vigência deve ser posterior ao início.");
					await onUpdate(institution, {
						...body,
						countryCode,
						effectiveUntil: effectiveUntil || undefined,
						profileId: selectedProfile,
						replacesEffectiveDate,
						requestedEffectiveDate: startDate,
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
