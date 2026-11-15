import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { LuChevronDown, LuChevronUp, LuPlus, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormSection } from "@/components/ui/FormSection";
import { Skeleton } from "@/components/ui/Skeleton";
import { type FinancialInstitutionYieldPolicy, getFinancialInstitutionsByIdPolicies } from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import { policyDay } from "@/routes/accounts/components/InstitutionYieldDialog/policy-selection";
import { showToast } from "@/stores";
import { NewProfileForm } from "./NewProfileForm";
import { PolicyDraftDialog } from "./PolicyDraftDialog";
import { policyProfileKey } from "./PolicyDraftEditor";
import { PolicyRow } from "./PolicyRow";
import { DEFAULT_PROFILE_NAME } from "./proposal";
import type { ExistingProfile, InstitutionFormState, PolicyDraft } from "./types";

interface ProfileGroup {
	isDefault: boolean;
	isNew: boolean;
	key: string;
	name: string;
}

const scopeKey = (policy: FinancialInstitutionYieldPolicy) =>
	`${policy.countryCode ?? ""}:${policy.accountType ?? ""}`;
const sortKey = (policy: FinancialInstitutionYieldPolicy) =>
	`${scopeKey(policy)}:${policyDay(policy.effectiveDate)}`;

/** Yield policies grouped by the profile they belong to: approved ones read-only, pending edits as drafts. */
export function PoliciesSection({
	disabled,
	institutionId,
	onChange,
	profiles,
	state,
}: {
	disabled: boolean;
	institutionId?: string;
	onChange: (patch: Partial<InstitutionFormState>) => void;
	profiles: ExistingProfile[];
	state: InstitutionFormState;
}) {
	const identity = useCacheIdentity();
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState<PolicyDraft>();
	const [presetProfile, setPresetProfile] = useState<string>();
	const query = useQuery({
		enabled: !!institutionId,
		queryFn: () =>
			getFinancialInstitutionsByIdPolicies({ path: { id: institutionId! } }).then(
				result => result.data,
			),
		queryKey: ["identity", identity, "institution-policies", institutionId],
	});
	const defaultProfile = profiles.find(profile => profile.isDefault);
	const groups: ProfileGroup[] = [
		...profiles.map(profile => ({
			isDefault: profile.isDefault,
			isNew: false,
			key: `id:${profile.id}`,
			name: profile.name,
		})),
		...(institutionId
			? []
			: [
					{
						isDefault: true,
						isNew: false,
						key: `name:${DEFAULT_PROFILE_NAME}`,
						name: DEFAULT_PROFILE_NAME,
					},
				]),
		...state.newProfiles
			.filter(profile => profile.name.trim())
			.map(profile => ({
				isDefault: false,
				isNew: true,
				key: `name:${profile.name.trim()}`,
				name: profile.name.trim(),
			})),
	];
	const approved = (query.data ?? []).filter(policy => !policy.status || policy.status === "APPROVED");
	const existingKey = (policy: FinancialInstitutionYieldPolicy) =>
		policy.profileId
			? `id:${policy.profileId}`
			: defaultProfile
				? `id:${defaultProfile.id}`
				: `name:${DEFAULT_PROFILE_NAME}`;
	const replaced = (policy: FinancialInstitutionYieldPolicy) =>
		state.policies.some(
			draft =>
				policyProfileKey(draft) === existingKey(policy) &&
				scopeKey(draft.policy) === scopeKey(policy) &&
				draft.policy.replacesEffectiveDate === policyDay(policy.effectiveDate),
		);
	const save = (draft: Omit<PolicyDraft, "key">) => {
		const known = editing && state.policies.some(item => item.key === editing.key);
		onChange({
			policies: known
				? state.policies.map(item => (item.key === editing.key ? { ...draft, key: item.key } : item))
				: [...state.policies, { ...draft, key: crypto.randomUUID() }],
		});
		showToast(editing ? "Política atualizada na edição" : "Política adicionada à edição", "info");
	};
	const openDialog = (draft: PolicyDraft | undefined, profileKey?: string) => {
		setEditing(draft);
		setPresetProfile(profileKey);
		setOpen(true);
	};
	const count = state.policies.length;
	const loading = !!institutionId && query.isPending;
	return (
		<FormSection
			summary={`${groups.length} ${groups.length === 1 ? "perfil" : "perfis"}${count ? ` · ${count} ${count === 1 ? "alteração" : "alterações"} de rendimento` : ""}`}
			title="Perfis e políticas de rendimento"
		>
			<p className="text-muted-foreground text-sm">
				Perfis são planos ou categorias de cliente, como Meli+ ou Prime. Cada perfil tem suas próprias
				políticas de rendimento; abra um perfil para ver e propor faixas e períodos.
			</p>
			{loading ? (
				<div className="grid gap-2">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
			) : query.isError ? (
				<div className="grid gap-2">
					<p role="alert">Não foi possível carregar as políticas atuais.</p>
					<ActionGroup>
						<Button onClick={() => void query.refetch()} type="button" variant="outline">
							Tentar novamente
						</Button>
					</ActionGroup>
				</div>
			) : (
				groups.map(group => {
					const drafts = state.policies.filter(draft => policyProfileKey(draft) === group.key);
					const rows = [
						...approved
							.filter(policy => existingKey(policy) === group.key && !replaced(policy))
							.map(policy => ({
								draft: {
									key: `existing:${sortKey(policy)}`,
									policy: {
										...policy,
										replacesEffectiveDate: policyDay(policy.effectiveDate),
									},
									profileId: group.key.startsWith("id:") ? group.key.slice(3) : undefined,
								} satisfies PolicyDraft,
								status: undefined,
							})),
						...drafts.map(draft => ({
							draft,
							status: draft.policy.replacesEffectiveDate
								? ("changed" as const)
								: ("new" as const),
						})),
					].toSorted((left, right) =>
						sortKey(left.draft.policy).localeCompare(sortKey(right.draft.policy)),
					);
					return (
						<ProfileCard
							disabled={disabled}
							group={group}
							key={group.key}
							onAdd={() => openDialog(undefined, group.key)}
							onRemoveProfile={
								group.isNew
									? () =>
											onChange({
												newProfiles: state.newProfiles.filter(
													item => item.name.trim() !== group.name,
												),
												policies: state.policies.filter(
													item => policyProfileKey(item) !== group.key,
												),
											})
									: undefined
							}
							policyCount={rows.length}
						>
							{rows.length ? (
								<ul className="grid gap-2">
									{rows.map(({ draft, status }) => (
										<PolicyRow
											disabled={disabled}
											key={draft.key}
											onEdit={() => openDialog(draft)}
											onRemove={
												status
													? () =>
															onChange({
																policies: state.policies.filter(
																	item => item.key !== draft.key,
																),
															})
													: undefined
											}
											policy={draft.policy}
											status={status}
										/>
									))}
								</ul>
							) : (
								<p className="text-muted-foreground text-sm">
									Sem política própria: usa o rendimento geral da instituição.
								</p>
							)}
						</ProfileCard>
					);
				})
			)}
			{!loading && !query.isError && (
				<NewProfileForm disabled={disabled} onChange={onChange} profiles={profiles} state={state} />
			)}
			<PolicyDraftDialog
				countries={state.countries}
				draft={editing}
				initialProfileKey={presetProfile}
				institutionId={institutionId}
				key={`${editing?.key ?? "new"}:${presetProfile ?? ""}`}
				newProfileNames={state.newProfiles.map(profile => profile.name.trim()).filter(Boolean)}
				onOpenChange={setOpen}
				onSubmit={save}
				open={open}
				profiles={profiles}
			/>
		</FormSection>
	);
}

/** One profile: collapsed it shows name and policy count; expanded, its policies and the add action. */
function ProfileCard({
	children,
	disabled,
	group,
	onAdd,
	onRemoveProfile,
	policyCount,
}: {
	children: ReactNode;
	disabled: boolean;
	group: ProfileGroup;
	onAdd: () => void;
	onRemoveProfile?: () => void;
	policyCount: number;
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<section className="grid min-w-0 gap-2 rounded-xl border p-3">
			<div className="flex min-w-0 items-center gap-2">
				<div className="min-w-0 flex-1">
					<h4 className="text-sm font-semibold break-words">
						{group.name} {group.isDefault && <Badge variant="secondary">Padrão</Badge>}{" "}
						{group.isNew && <Badge>Novo</Badge>}
					</h4>
					<p className="text-muted-foreground text-xs">
						{policyCount
							? `${policyCount} ${policyCount === 1 ? "política" : "políticas"} de rendimento`
							: "Sem política própria: usa o rendimento geral"}
					</p>
				</div>
				{onRemoveProfile && (
					<Button
						aria-label={`Remover perfil ${group.name}`}
						disabled={disabled}
						onClick={onRemoveProfile}
						size="icon-sm"
						type="button"
						variant="outline"
					>
						<LuX />
					</Button>
				)}
				<Button
					aria-expanded={expanded}
					aria-label={expanded ? "Minimizar" : "Expandir"}
					onClick={() => setExpanded(!expanded)}
					size="icon-sm"
					type="button"
					variant="outline"
				>
					{expanded ? <LuChevronUp /> : <LuChevronDown />}
				</Button>
			</div>
			{expanded && (
				<>
					{children}
					<ActionGroup>
						<Button disabled={disabled} onClick={onAdd} size="sm" type="button" variant="outline">
							<LuPlus />
							Adicionar política
						</Button>
					</ActionGroup>
				</>
			)}
		</section>
	);
}
