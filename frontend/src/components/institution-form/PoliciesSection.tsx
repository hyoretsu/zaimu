import { useState } from "react";
import { LuPencil, LuPlus, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CollapsibleFormSection } from "@/components/ui/CollapsibleFormSection";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { showToast } from "@/stores";
import { policyPeriod, policyScope, policyTiers } from "./policy-summary";
import { PolicyDraftDialog } from "./PolicyDraftDialog";
import { DEFAULT_PROFILE_NAME } from "./proposal";
import type { ExistingProfile, InstitutionFormState, PolicyDraft } from "./types";

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
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState<PolicyDraft>();
	const profileLabel = (draft: PolicyDraft) =>
		draft.profileId
			? (profiles.find(profile => profile.id === draft.profileId)?.name ?? "Perfil")
			: (draft.profileName ?? DEFAULT_PROFILE_NAME);
	const save = (draft: Omit<PolicyDraft, "key">) => {
		onChange({
			policies: editing
				? state.policies.map(item => (item.key === editing.key ? { ...draft, key: item.key } : item))
				: [...state.policies, { ...draft, key: crypto.randomUUID() }],
		});
		showToast(editing ? "Política atualizada na edição" : "Política adicionada à edição", "info");
	};
	const count = state.policies.length;
	return (
		<CollapsibleFormSection
			summary={
				count
					? `${count} ${count === 1 ? "política" : "políticas"} de rendimento nesta sugestão`
					: "Nenhuma política de rendimento alterada"
			}
			title="Políticas de rendimento"
		>
			{count > 0 && (
				<ul className="grid gap-2">
					{state.policies.map(draft => (
						<li className="flex min-w-0 items-start gap-3 rounded-xl border p-3" key={draft.key}>
							<div className="min-w-0 flex-1 space-y-1 text-sm">
								<p className="font-medium break-words">
									{profileLabel(draft)} - {policyScope(draft.policy)}
								</p>
								<p className="text-muted-foreground break-words">
									{policyPeriod(draft.policy)}
								</p>
								{policyTiers(draft.policy).map(line => (
									<p className="text-muted-foreground break-words" key={line}>
										{line}
									</p>
								))}
							</div>
							<ActionGroup className="shrink-0 flex-nowrap">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											aria-label={`Editar política de ${profileLabel(draft)}`}
											disabled={disabled}
											onClick={() => {
												setEditing(draft);
												setOpen(true);
											}}
											size="icon-sm"
											type="button"
											variant="outline"
										>
											<LuPencil />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Editar política</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											aria-label={`Remover política de ${profileLabel(draft)}`}
											disabled={disabled}
											onClick={() =>
												onChange({
													policies: state.policies.filter(
														item => item.key !== draft.key,
													),
												})
											}
											size="icon-sm"
											type="button"
											variant="outline"
										>
											<LuX />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Remover política</TooltipContent>
								</Tooltip>
							</ActionGroup>
						</li>
					))}
				</ul>
			)}
			<ActionGroup>
				<Button
					disabled={disabled}
					onClick={() => {
						setEditing(undefined);
						setOpen(true);
					}}
					type="button"
					variant="outline"
				>
					<LuPlus />
					Adicionar política
				</Button>
			</ActionGroup>
			<PolicyDraftDialog
				countries={state.countries}
				draft={editing}
				institutionId={institutionId}
				key={editing?.key ?? "new"}
				newProfileNames={state.newProfiles.map(profile => profile.name.trim()).filter(Boolean)}
				onOpenChange={setOpen}
				onSubmit={save}
				open={open}
				profiles={profiles}
			/>
		</CollapsibleFormSection>
	);
}
