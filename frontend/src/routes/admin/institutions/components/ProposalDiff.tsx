import { defaultCardRules, type InstitutionCardRules } from "@zaimu/finance/institution-card-rules";
import { describeCardRules, policyPeriod, policyScope, policyTiers } from "@/components/institution-form";
import { useInstitutionProfiles } from "@/components/institution-form/use-institution-profiles";
import { Badge } from "@/components/ui/Badge";
import { countryName } from "@/lib/countries";

const FIELD_LABELS: Record<string, string> = {
	aliases: "Outros nomes",
	creditCardRules: "Regras de cartão",
	creditInstallmentRemainderOnFirst: "Resto das parcelas",
	creditStatementClosingInclusive: "Fechamento da fatura",
	currency: "Moeda",
	name: "Nome",
	operatingCountryCodes: "Países de operação",
	policies: "Políticas de rendimento",
	profiles: "Perfis",
	removedPolicies: "Políticas removidas",
};

const closing = (value: unknown) => (value ? "Inclusivo" : "Exclusivo");
const remainder = (value: unknown) =>
	value ? "Concentrado na primeira parcela" : "Distribuído entre as parcelas";

interface ProposedProfile {
	creditCardRules?: InstitutionCardRules | null;
	id?: string;
	name: string;
}

interface ProposedPolicy {
	accountType?: string | null;
	countryCode?: string | null;
	effectiveDate: string;
	effectiveUntil?: string | null;
	profileId?: string;
	profileName?: string;
	replacesEffectiveDate?: string;
	rules: {
		upToBalance?: number | null;
		yieldFixedRate?: number | null;
		yieldReferencePercentage?: number | null;
		yieldReferenceType?: string | null;
	}[];
	yieldPeriod?: string | null;
	yieldTaxRate?: number | null;
}

function CountryDiff({ current, proposed }: { current: string[]; proposed: string[] }) {
	const added = proposed.filter(code => !current.includes(code));
	const removed = current.filter(code => !proposed.includes(code));
	return (
		<div className="flex flex-wrap gap-1">
			{added.map(code => (
				<Badge key={`+${code}`} variant="secondary">
					+ {countryName(code)}
				</Badge>
			))}
			{removed.map(code => (
				<Badge key={`-${code}`} variant="destructive">
					- {countryName(code)}
				</Badge>
			))}
			{!added.length && !removed.length && <span className="text-muted-foreground">Sem mudança</span>}
		</div>
	);
}

function ValueDiff({ current, isNew, proposed }: { current: string; isNew?: boolean; proposed: string }) {
	return (
		<p className="break-words">
			{!isNew && <span className="text-muted-foreground line-through">{current || "Sem valor"}</span>}{" "}
			<span className="font-medium">{proposed || "Sem valor"}</span>
		</p>
	);
}

/** Card rules line by line: unchanged lines stay muted, changed ones show before and after. */
function CardRulesDiff({
	current,
	isNew,
	proposed,
}: {
	current: InstitutionCardRules | null | undefined;
	isNew?: boolean;
	proposed: InstitutionCardRules | null | undefined;
}) {
	const before = describeCardRules(current ?? defaultCardRules);
	const after = describeCardRules(proposed ?? defaultCardRules);
	return (
		<ul className="grid gap-1">
			{after.map(line => {
				const previous = before.find(item => item.label === line.label)?.value;
				const changed = !isNew && previous !== line.value;
				return (
					<li className="break-words" key={line.label}>
						<span className="text-muted-foreground">{line.label}: </span>
						{changed && (
							<span className="text-muted-foreground line-through">
								{previous ?? "Sem valor"}{" "}
							</span>
						)}
						<span className={changed || isNew ? "font-medium" : "text-muted-foreground"}>
							{line.value}
						</span>
					</li>
				);
			})}
		</ul>
	);
}

function ProfilesDiff({
	current,
	institutionId,
	isNew,
	profiles,
}: {
	current?: Record<string, unknown>;
	institutionId?: string;
	isNew?: boolean;
	profiles: ProposedProfile[];
}) {
	const existing = useInstitutionProfiles(isNew ? undefined : institutionId);
	return (
		<ul className="grid gap-2">
			{profiles.map(profile => {
				const known = profile.id ? existing.data?.find(item => item.id === profile.id) : undefined;
				const base =
					known?.creditCardRules ??
					(current?.creditCardRules as InstitutionCardRules | null | undefined);
				return (
					<li className="grid gap-1 rounded-xl border p-3" key={profile.id ?? profile.name}>
						<p className="flex flex-wrap items-center gap-2 font-medium">
							{profile.name}
							<Badge variant={profile.id ? "outline" : "secondary"}>
								{profile.id ? "Regras alteradas" : "Novo perfil"}
							</Badge>
						</p>
						{profile.creditCardRules === undefined ? null : profile.creditCardRules === null ? (
							<p className="text-muted-foreground">
								Passa a seguir as regras do padrão da instituição.
							</p>
						) : (
							<CardRulesDiff
								current={profile.id ? base : undefined}
								isNew={!profile.id}
								proposed={profile.creditCardRules}
							/>
						)}
						{!profile.id && profile.creditCardRules === undefined && (
							<p className="text-muted-foreground">Segue as regras do padrão da instituição.</p>
						)}
					</li>
				);
			})}
		</ul>
	);
}

function PoliciesDiff({
	institutionId,
	isNew,
	policies,
}: {
	institutionId?: string;
	isNew?: boolean;
	policies: ProposedPolicy[];
}) {
	const existing = useInstitutionProfiles(isNew ? undefined : institutionId);
	return (
		<ul className="grid gap-2">
			{policies.map(policy => (
				<li
					className="grid gap-1 rounded-xl border p-3"
					key={`${policy.profileId ?? policy.profileName}:${policy.countryCode}:${policy.accountType}:${policy.effectiveDate}`}
				>
					<p className="font-medium break-words">
						{policy.profileId
							? (existing.data?.find(profile => profile.id === policy.profileId)?.name ??
								"Perfil existente")
							: policy.profileName}{" "}
						- {policyScope(policy)}
					</p>
					<p className="text-muted-foreground">
						Vigência: {policyPeriod(policy)}
						{policy.replacesEffectiveDate
							? ` (substitui o período iniciado em ${policy.replacesEffectiveDate.slice(0, 10).split("-").reverse().join("/")})`
							: ""}
					</p>
					{policyTiers(policy).map(line => (
						<p className="break-words" key={line}>
							{line}
						</p>
					))}
				</li>
			))}
		</ul>
	);
}

function RemovedPoliciesDiff({
	institutionId,
	policies,
}: {
	institutionId?: string;
	policies: Pick<ProposedPolicy, "accountType" | "countryCode" | "effectiveDate" | "profileId">[];
}) {
	const existing = useInstitutionProfiles(institutionId);
	return (
		<ul className="grid gap-2">
			{policies.map(policy => (
				<li
					className="grid gap-1 rounded-xl border p-3"
					key={`${policy.profileId}:${policy.countryCode}:${policy.accountType}:${policy.effectiveDate}`}
				>
					<p className="font-medium break-words">
						<Badge variant="destructive">Removida</Badge>{" "}
						{existing.data?.find(profile => profile.id === policy.profileId)?.name ??
							"Perfil existente"}{" "}
						- {policyScope(policy)}
					</p>
					<p className="text-muted-foreground">
						Período iniciado em {policy.effectiveDate.slice(0, 10).split("-").reverse().join("/")}
					</p>
				</li>
			))}
		</ul>
	);
}

/** Readable before/after for every section a composite institution proposal can carry. */
export function InstitutionUpdateDiff({
	current,
	institutionId,
	isNew = false,
	payload,
}: {
	current?: Record<string, unknown>;
	institutionId?: string;
	/** A new institution has nothing to compare against: only the proposed values show. */
	isNew?: boolean;
	payload: Record<string, unknown>;
}) {
	const base = isNew ? undefined : current;
	const fields = Object.keys(FIELD_LABELS).filter(key => payload[key] !== undefined);
	return (
		<dl className="grid min-w-0 gap-3 text-sm">
			{fields.map(key => (
				<div className="grid min-w-0 gap-1" key={key}>
					<dt className="font-medium">{FIELD_LABELS[key]}</dt>
					<dd>
						{key === "operatingCountryCodes" ? (
							<CountryDiff
								current={(base?.operatingCountryCodes as string[] | undefined) ?? []}
								proposed={payload.operatingCountryCodes as string[]}
							/>
						) : key === "creditStatementClosingInclusive" ? (
							<ValueDiff
								current={closing(base?.[key])}
								isNew={isNew}
								proposed={closing(payload[key])}
							/>
						) : key === "creditInstallmentRemainderOnFirst" ? (
							<ValueDiff
								current={remainder(base?.[key])}
								isNew={isNew}
								proposed={remainder(payload[key])}
							/>
						) : key === "aliases" ? (
							<ValueDiff
								current={((base?.aliases as string[] | undefined) ?? []).join(", ")}
								isNew={isNew}
								proposed={(payload.aliases as string[]).join(", ")}
							/>
						) : key === "creditCardRules" ? (
							<CardRulesDiff
								current={base?.creditCardRules as InstitutionCardRules | null | undefined}
								isNew={isNew}
								proposed={payload.creditCardRules as InstitutionCardRules}
							/>
						) : key === "profiles" ? (
							<ProfilesDiff
								current={base}
								institutionId={institutionId}
								isNew={isNew}
								profiles={payload.profiles as ProposedProfile[]}
							/>
						) : key === "policies" ? (
							<PoliciesDiff
								institutionId={institutionId}
								isNew={isNew}
								policies={payload.policies as ProposedPolicy[]}
							/>
						) : key === "removedPolicies" ? (
							<RemovedPoliciesDiff
								institutionId={institutionId}
								policies={payload.removedPolicies as ProposedPolicy[]}
							/>
						) : (
							<ValueDiff
								current={String(base?.[key] ?? "")}
								isNew={isNew}
								proposed={String(payload[key])}
							/>
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}
