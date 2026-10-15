import { useQueryClient } from "@tanstack/react-query";
import { ActionGroup } from "@/components/ui/ActionGroup";
import type { FinancialInstitution } from "@/lib/api";
import { fetchWithAuth } from "@/lib/dataService";
import { EditInstitutionDialog } from "@/routes/accounts/components/EditInstitutionDialog";
import { InstitutionYieldDialog } from "@/routes/accounts/components/InstitutionYieldDialog";
import { showToast } from "@/stores";

export function InstitutionCatalogRow({ institution }: { institution: FinancialInstitution }) {
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
						? institution.operatingCountryCodes.map(code => countryNames.of(code) ?? code).join(", ")
						: "Países não informados"}
				</p>
			</div>
			<ActionGroup>
				<EditInstitutionDialog
					institution={institution}
					onUpdate={(item, name, currency, creditInstallmentRemainderOnFirst, operatingCountryCodes) =>
						propose(
							`/financial-institutions/${item.id}`,
							{ creditInstallmentRemainderOnFirst, currency, name, operatingCountryCodes },
							"PATCH",
						)
					}
				/>
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
