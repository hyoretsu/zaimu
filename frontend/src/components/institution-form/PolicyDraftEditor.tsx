import { useQuery } from "@tanstack/react-query";
import { countryCurrency } from "@zaimu/finance/currency-preference";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { DialogBody } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { type FinancialInstitutionYieldPolicy, getFinancialInstitutionsByIdPolicies } from "@/lib/api";
import { countryName } from "@/lib/countries";
import { useCacheIdentity } from "@/lib/query-cache";
import { InstitutionYieldPolicyForm } from "@/routes/accounts/components/InstitutionYieldDialog/InstitutionYieldPolicyForm";
import { InstitutionYieldTimeline } from "@/routes/accounts/components/InstitutionYieldDialog/InstitutionYieldTimeline";
import {
	OPEN_START,
	policyDay,
	policyTimeline,
	selectEditablePolicy,
	visibleStart,
	YIELD_ACCOUNT_TYPES,
	type YieldAccountType,
} from "@/routes/accounts/components/InstitutionYieldDialog/policy-selection";
import { useCurrencyStore } from "@/stores/currency";
import { DEFAULT_PROFILE_NAME } from "./proposal";
import type { ExistingProfile, PolicyDraft } from "./types";

const ID = "id:";
const NAME = "name:";

/** Option value for the profile a policy targets: existing profiles by id, new ones by name. */
export const policyProfileKey = (draft: Pick<PolicyDraft, "profileId" | "profileName">) =>
	draft.profileId ? `${ID}${draft.profileId}` : `${NAME}${draft.profileName}`;

/**
 * Edits one yield policy and hands it back as a draft instead of posting it:
 * the form collects every policy and submits them together with the rest of the proposal.
 */
export function PolicyDraftEditor({
	countries,
	draft,
	initialProfileKey,
	institutionId,
	newProfileNames,
	onClose,
	onSubmit,
	profiles,
}: {
	countries: string[];
	draft?: PolicyDraft;
	initialProfileKey?: string;
	institutionId?: string;
	newProfileNames: string[];
	onClose: () => void;
	onSubmit: (draft: Omit<PolicyDraft, "key">) => void;
	profiles: ExistingProfile[];
}) {
	const identity = useCacheIdentity();
	const today = new Date().toLocaleDateString("sv-SE");
	const profileOptions = [
		...profiles.map(profile => ({ label: profile.name, value: `${ID}${profile.id}` })),
		...(institutionId ? [] : [{ label: DEFAULT_PROFILE_NAME, value: `${NAME}${DEFAULT_PROFILE_NAME}` }]),
		...newProfileNames.map(name => ({ label: `${name} (novo)`, value: `${NAME}${name}` })),
	];
	const defaultProfileKey =
		initialProfileKey ??
		(profiles.find(profile => profile.isDefault) !== undefined
			? `${ID}${profiles.find(profile => profile.isDefault)!.id}`
			: `${NAME}${DEFAULT_PROFILE_NAME}`);
	const [profileKey, setProfileKey] = useState(draft ? policyProfileKey(draft) : defaultProfileKey);
	const [countryCode, setCountry] = useState<string | undefined>(draft?.policy.countryCode ?? undefined);
	const [accountType, setAccountType] = useState<YieldAccountType | undefined>(
		draft?.policy.accountType ?? undefined,
	);
	const [copied, setCopied] = useState<{ policy: FinancialInstitutionYieldPolicy; scope: string }>();
	const [draftActive, setDraftActive] = useState(!!draft);
	const [effectiveDate, setDate] = useState(
		draft ? visibleStart(draft.policy.requestedEffectiveDate ?? draft.policy.effectiveDate) : "",
	);
	const [sourceDate, setSourceDate] = useState(today);
	const [effectiveUntil, setUntil] = useState(
		draft?.policy.effectiveUntil ? policyDay(draft.policy.effectiveUntil) : "",
	);
	const [editingStart, setEditingStart] = useState<string | undefined>(draft?.policy.replacesEffectiveDate);
	const preferredCurrency = useCurrencyStore(state => state.currency);
	const currencies = useCurrencyStore(state => state.currencies);
	const currency = (countryCode ? countryCurrency(countryCode, currencies) : null) ?? preferredCurrency;
	const policies = useQuery({
		enabled: !!institutionId,
		queryFn: () =>
			getFinancialInstitutionsByIdPolicies({ path: { id: institutionId! } }).then(
				result => result.data,
			),
		queryKey: ["identity", identity, "institution-policies", institutionId],
	});
	const known = policies.data ?? [];
	const profileId = profileKey.startsWith(ID) ? profileKey.slice(ID.length) : undefined;
	const profileName = profileKey.startsWith(NAME) ? profileKey.slice(NAME.length) : undefined;
	const timeline = policyTimeline(known, profileId, countryCode, currency, accountType);
	const editedPolicy = editingStart
		? timeline.find(item => policyDay(item.effectiveDate) === editingStart)
		: undefined;
	const replacesEffectiveDate = editedPolicy ? editingStart : undefined;
	const scope = `${profileKey}:${countryCode}:${accountType}`;
	const copiedPolicy = copied?.scope === scope && !editedPolicy ? copied.policy : undefined;
	const policy =
		editedPolicy ??
		copiedPolicy ??
		(draftActive ? draft?.policy : undefined) ??
		selectEditablePolicy(known, profileId, countryCode, sourceDate, currency, accountType);
	const copySources = [{ label: "Todos os tipos", value: "__all__" as const }, ...YIELD_ACCOUNT_TYPES]
		.filter(option => (option.value === "__all__" ? undefined : option.value) !== accountType)
		.flatMap(option => {
			const source = selectEditablePolicy(
				known,
				profileId,
				countryCode,
				today,
				currency,
				option.value === "__all__" ? undefined : option.value,
			);
			return source ? [{ label: option.label, source, value: option.value }] : [];
		});
	const resetScope = () => {
		setDraftActive(false);
		setEditingStart(undefined);
		setSourceDate(today);
		setUntil("");
	};
	const controls = (
		<>
			<CustomSelect
				label="Perfil da política"
				onValueChange={value => {
					if (!value) return;
					const nextProfile = value.startsWith(ID) ? value.slice(ID.length) : undefined;
					const nextPolicy = selectEditablePolicy(
						known,
						nextProfile,
						countryCode,
						today,
						currency,
						accountType,
					);
					setProfileKey(value);
					resetScope();
					setDate(nextPolicy ? visibleStart(nextPolicy.effectiveDate) : "");
					setUntil(nextPolicy?.effectiveUntil ? policyDay(nextPolicy.effectiveUntil) : "");
				}}
				options={profileOptions}
				placeholder="Ex: Padrão"
				required
				searchable
				value={profileKey}
			/>
			<CustomSelect
				label="País aplicável"
				onValueChange={value => {
					setCountry(!value || value === "__all__" ? undefined : value);
					resetScope();
				}}
				options={[
					{ label: "Todos os países", special: true, value: "__all__" },
					...countries.map(value => ({ label: countryName(value), value })),
				]}
				placeholder="Todos os países"
				searchable
				value={countryCode ?? "__all__"}
			/>
			<CustomSelect
				label="Tipo de conta"
				onValueChange={value => {
					setAccountType(!value || value === "__all__" ? undefined : (value as YieldAccountType));
					resetScope();
				}}
				options={[
					{ label: "Todos os tipos", special: true, value: "__all__" },
					...YIELD_ACCOUNT_TYPES,
				]}
				placeholder="Todos os tipos"
				value={accountType ?? "__all__"}
			/>
			{copySources.length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium">Copiar rendimento de</span>
					{copySources.map(({ label, source, value }) => (
						<Button
							key={value}
							onClick={() => {
								setCopied({ policy: { ...source, accountType }, scope });
								setDraftActive(false);
								setEditingStart(undefined);
							}}
							size="sm"
							type="button"
							variant="outline"
						>
							{label}
						</Button>
					))}
				</div>
			)}
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
					Sem início, vale desde todo o período anterior; sem fim, vale até a próxima mudança.
				</p>
			</div>
			<InstitutionYieldTimeline
				accountType={accountType}
				countryCode={countryCode}
				currency={currency}
				onNew={() => {
					setDraftActive(false);
					setEditingStart(undefined);
					setSourceDate(effectiveDate || today);
					setUntil("");
				}}
				onSelect={item => {
					setDraftActive(false);
					setEditingStart(policyDay(item.effectiveDate));
					setDate(visibleStart(item.effectiveDate));
					setUntil(item.effectiveUntil ? policyDay(item.effectiveUntil) : "");
				}}
				policies={known}
				profileId={profileId}
				selectedStart={replacesEffectiveDate}
			/>
		</>
	);
	let content: ReactNode;
	if (institutionId && policies.isPending) {
		content = (
			<DialogBody>
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
				<Skeleton className="h-72" />
			</DialogBody>
		);
	} else if (institutionId && policies.isError) {
		content = (
			<DialogBody>
				<p role="alert">Não foi possível carregar as políticas atuais.</p>
				<Button onClick={() => void policies.refetch()} type="button" variant="outline">
					Tentar novamente
				</Button>
			</DialogBody>
		);
	} else {
		content = (
			<InstitutionYieldPolicyForm
				controls={controls}
				currency={currency}
				key={`${scope}:${replacesEffectiveDate ?? ""}:${copiedPolicy ? "copy" : ""}:${draftActive ? "draft" : ""}`}
				onDiscard={onClose}
				onSave={async body => {
					const startDate = effectiveDate || OPEN_START;
					if (effectiveUntil && effectiveUntil <= startDate)
						throw new Error("O fim da vigência deve ser posterior ao início.");
					onSubmit({
						policy: {
							...body,
							accountType,
							countryCode,
							effectiveDate: startDate,
							effectiveUntil: effectiveUntil || undefined,
							replacesEffectiveDate,
							requestedEffectiveDate: startDate,
						},
						profileId,
						profileName,
					});
					onClose();
				}}
				policy={policy}
			/>
		);
	}
	return content;
}
