import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { LuSend } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { DialogBody, DialogFooter } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CardRulesSection } from "./CardRulesSection";
import { CountriesSection } from "./CountriesSection";
import { IdentitySection } from "./IdentitySection";
import { InvoiceSection } from "./InvoiceSection";
import { PoliciesSection } from "./PoliciesSection";
import { buildProposalBody, duplicateProfileName, initialFormState, invalidCardRules } from "./proposal";
import { submitInstitutionProposal } from "./submit";
import type {
	ExistingProfile,
	InstitutionFormDraft,
	InstitutionFormMode,
	InstitutionFormSource,
	InstitutionFormState,
} from "./types";
import { useInstitutionProfiles } from "./use-institution-profiles";

export { describeCardRules } from "./card-rules-summary";
export { policyPeriod, policyScope, policyTiers } from "./policy-summary";
export type { InstitutionFormDraft, InstitutionFormMode, InstitutionFormSource } from "./types";

export const INSTITUTION_FORM_RECOVERY_KIND = "institution-suggestion:form";
const NO_PROFILES: ExistingProfile[] = [];

/**
 * Complete institution form shared by the suggestion hub and the admin catalog.
 * Collects identity, countries, invoice rules, card rules, profiles and yield policies
 * and submits them as one proposal. Renders a body and footer: place it inside a `DialogContent`.
 */
export function InstitutionForm({
	header,
	institution,
	mode,
	onClose,
	recovered,
}: {
	/** Rendered at the top of the scrollable body (e.g. the hub's back button and institution picker). */
	header?: ReactNode;
	institution?: InstitutionFormSource;
	mode: InstitutionFormMode;
	onClose: () => void;
	recovered?: InstitutionFormDraft;
}) {
	const client = useQueryClient();
	const identity = useCacheIdentity();
	const profilesQuery = useInstitutionProfiles(institution?.id);
	const profiles = profilesQuery.data ?? NO_PROFILES;
	const [state, setState] = useState<InstitutionFormState>(
		() => recovered?.state ?? initialFormState(institution),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const conflictKey = `${INSTITUTION_FORM_RECOVERY_KIND}:${institution?.id ?? "new"}`;
	const backgroundPending = useModalRecoveryStore(store => !!store.pending[`${identity}:${conflictKey}`]);
	const pending = saving || backgroundPending;
	const patch = (changes: Partial<InstitutionFormState>) => {
		setError("");
		setState(previous => ({ ...previous, ...changes }));
	};
	const body = buildProposalBody(state, institution, profiles);
	const changed = Object.keys(body).length > 0;
	const loading = !!institution && profilesQuery.isPending;
	const validate = () => {
		const name = state.name.trim();
		if (!name || name.length > 100) return "Informe um nome com até 100 caracteres.";
		if (
			invalidCardRules(state.rules) ||
			Object.values(state.profileRules).some(invalidCardRules) ||
			state.newProfiles.some(profile => invalidCardRules(profile.rules))
		)
			return "Revise as regras de cartão: informe valores positivos para recompensa e conversão.";
		const duplicate = duplicateProfileName(state, profiles);
		if (duplicate) return `Já existe um perfil chamado ${duplicate}.`;
		return "";
	};
	const submit = async () => {
		if (pending) return;
		const problem = validate();
		if (problem) {
			setError(problem);
			return;
		}
		if (mode === "suggest") {
			runBackgroundModalAction({
				cache: { client, operations: ["institution"] },
				close: onClose,
				conflictKey,
				failureMessage: "Não foi possível enviar a sugestão.",
				loadingMessage: "Enviando sugestão...",
				recovery: {
					entityId: institution?.id,
					kind: INSTITUTION_FORM_RECOVERY_KIND,
					payload: { institution, state } satisfies InstitutionFormDraft,
				},
				run: () => submitInstitutionProposal(mode, institution, body),
				successMessage: "Sugestão enviada para revisão administrativa",
			});
			return;
		}
		const start = captureCacheMutation();
		setSaving(true);
		try {
			await submitInstitutionProposal(mode, institution, body);
			await invalidateMutationCache(client, start, {
				...mutationCacheMeta("institution"),
				awaitRefetch: true,
			});
			showToast("Configurações da instituição salvas", "positive");
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Não foi possível salvar a instituição.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
			<DialogBody>
				{header}
				{loading ? (
					<>
						<Skeleton className="h-28 rounded-xl" />
						<Skeleton className="h-16 rounded-xl" />
						<Skeleton className="h-16 rounded-xl" />
						<Skeleton className="h-16 rounded-xl" />
					</>
				) : profilesQuery.isError ? (
					<div className="grid gap-3">
						<p role="alert">Não foi possível carregar os perfis da instituição.</p>
						<Button onClick={() => void profilesQuery.refetch()} type="button" variant="outline">
							Tentar novamente
						</Button>
					</div>
				) : (
					<>
						<IdentitySection disabled={pending} onChange={patch} state={state} />
						<CountriesSection disabled={pending} onChange={patch} state={state} />
						<InvoiceSection disabled={pending} onChange={patch} state={state} />
						<CardRulesSection
							disabled={pending}
							onChange={patch}
							profiles={profiles}
							state={state}
						/>
						<PoliciesSection
							disabled={pending}
							institutionId={institution?.id}
							onChange={patch}
							profiles={profiles}
							state={state}
						/>
						{mode === "suggest" && (
							<p className="text-muted-foreground text-sm">
								{institution
									? "Apenas os campos alterados são enviados. Um admin compara com o cadastro atual antes de aprovar."
									: "A instituição fica privada para você até um admin aprovar a sugestão."}
							</p>
						)}
						{error && (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						)}
					</>
				)}
			</DialogBody>
			<DialogFooter>
				<Button disabled={saving} onClick={onClose} type="button" variant="outline">
					Descartar
				</Button>
				<Button
					disabled={pending || loading || profilesQuery.isError || (!!institution && !changed)}
					onClick={() => void submit()}
					type="button"
				>
					{mode === "suggest" && <LuSend />}
					{pending ? "Salvando..." : mode === "suggest" ? "Enviar sugestão" : "Salvar"}
				</Button>
			</DialogFooter>
		</div>
	);
}
