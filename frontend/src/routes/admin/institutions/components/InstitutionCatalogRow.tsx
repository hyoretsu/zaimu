import { useQueryClient } from "@tanstack/react-query";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { fetchWithAuth } from "@/lib/dataService";
import { InstitutionYieldDialog } from "@/routes/accounts/components/InstitutionYieldDialog";
import { showToast } from "@/stores";
import { EditInstitutionCatalogDialog } from "./EditInstitutionCatalogDialog";
import type { AdminInstitution } from "./types";

export function InstitutionCatalogRow({ institution }: { institution: AdminInstitution }) {
	const queryClient = useQueryClient();
	const countryNames = new Intl.DisplayNames("pt-BR", { type: "region" });
	const propose = async (path: string, body: unknown, method: "PATCH" | "POST") => {
		try {
			await fetchWithAuth(path, { body: JSON.stringify(body), method });
			showToast("Proposta enviada para revisão administrativa", "positive");
			await queryClient.invalidateQueries({ queryKey: ["institution-review"] });
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
				<InstitutionYieldDialog
					institution={institution}
					onUpdate={(item, policy) => {
						const { requestedEffectiveDate, ...body } = policy;
						return propose(
							`/financial-institutions/${item.id}/policies`,
							{ ...body, effectiveDate: requestedEffectiveDate },
							"POST",
						);
					}}
				/>
			</ActionGroup>
		</article>
	);
}
