import { useQueryClient } from "@tanstack/react-query";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { postFinancialInstitutionsByIdPolicies } from "@/lib/api";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { InstitutionYieldDialog } from "@/routes/accounts/components/InstitutionYieldDialog";
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
			showToast(error instanceof Error ? error.message : "Não foi possível enviar a proposta", "negative");
			throw error;
		}
	};
	return (
		<article className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-4">
			<div className="min-w-0 flex-1 space-y-1">
				<h3 className="break-words font-semibold">{institution.name}</h3>
				<p className="break-words text-muted-foreground text-sm">
					{institution.currency ?? "Moeda não definida"} - Versão {institution.version ?? 1}
				</p>
				<p className="break-words text-muted-foreground text-sm">
					{institution.operatingCountryCodes?.length
						? institution.operatingCountryCodes
								.map(
									code =>
										`${countryNames.of(code) ?? code}: ${institution.accountCurrenciesByCountry?.[code]?.join(", ") || "Moedas não definidas"}`,
								)
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
						const { requestedEffectiveDate, profileId, yieldTaxIds, ...body } = policy;
						if (!requestedEffectiveDate || !profileId || !body.currency)
							return Promise.reject(new Error("Selecione perfil e data de vigência."));
						return propose(item.id, {
							...body,
							countryCode: body.countryCode ?? undefined,
							currency: body.currency,
							effectiveDate: requestedEffectiveDate,
							effectiveUntil: body.effectiveUntil ?? undefined,
							profileId,
							rules: body.rules.map(rule => ({ ...rule, upToBalance: rule.upToBalance ?? null })),
							yieldTaxIds: yieldTaxIds ?? undefined,
						});
					}}
				/>
			</ActionGroup>
		</article>
	);
}
