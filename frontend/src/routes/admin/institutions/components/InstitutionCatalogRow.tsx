import { useQueryClient } from "@tanstack/react-query";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { postFinancialInstitutionsByIdPolicies } from "@/lib/api";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { InstitutionYieldDialog } from "@/routes/accounts/components/InstitutionYieldDialog";
import { toPolicyProposalBody } from "@/routes/accounts/components/InstitutionYieldDialog/policy-proposal";
import { showToast } from "@/stores";
import { EditInstitutionCatalogDialog } from "./EditInstitutionCatalogDialog";
import { InstitutionCardRulesDialog } from "./InstitutionCardRulesDialog";
import type { AdminInstitution } from "./types";

export function InstitutionCatalogRow({ institution }: { institution: AdminInstitution }) {
	const queryClient = useQueryClient();
	const countryNames = new Intl.DisplayNames("pt-BR", { type: "region" });
	const propose = async (...args: Parameters<typeof postFinancialInstitutionsByIdPolicies>) => {
		const start = captureCacheMutation();
		try {
			await postFinancialInstitutionsByIdPolicies(...args);
			showToast("Proposta enviada para revisão administrativa", "positive");
			await invalidateMutationCache(queryClient, start, {
				...mutationCacheMeta("institution"),
				awaitRefetch: true,
			});
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Não foi possível enviar a proposta",
				"negative",
			);
			throw error;
		}
	};
	return (
		<article className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-4">
			<div className="min-w-0 flex-1 space-y-1">
				<h3 className="font-semibold break-words">{institution.name}</h3>
				{!!institution.aliases?.length && (
					<p className="text-muted-foreground text-sm break-words">
						Também conhecida como {institution.aliases.join(", ")}
					</p>
				)}
				<p className="text-muted-foreground text-sm break-words">Versão {institution.version ?? 1}</p>
				<p className="text-muted-foreground text-sm break-words">
					{institution.operatingCountryCodes?.length
						? institution.operatingCountryCodes
								.map(code => countryNames.of(code) ?? code)
								.join("; ")
						: "Países não informados"}
				</p>
			</div>
			<ActionGroup>
				<EditInstitutionCatalogDialog institution={institution} />
				<InstitutionCardRulesDialog institution={institution} />
				<InstitutionYieldDialog
					institution={institution}
					onUpdate={(item, policy) => {
						try {
							return propose(item.id, toPolicyProposalBody(policy));
						} catch (error) {
							return Promise.reject(error);
						}
					}}
				/>
			</ActionGroup>
		</article>
	);
}
