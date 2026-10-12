import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuLink } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type { FinancialInstitution } from "@/lib/api";
import { dataService, fetchWithAuth } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function InstitutionMergeProposal({ institution }: { institution: FinancialInstitution }) {
	const identity = useCacheIdentity();
	const [target, setTarget] = useState<string>();
	const [pending, setPending] = useState(false);
	const catalog = useQuery({
		enabled: institution.status === "LEGACY_PRIVATE",
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["merge-institution-catalog", identity],
	});
	if (institution.status !== "LEGACY_PRIVATE") return null;
	return (
		<section className="grid gap-3 rounded-xl border p-3">
			<h3 className="font-semibold">Associar instituição legada</h3>
			<p className="text-muted-foreground text-sm">
				Admin revisará identidade e conflitos de perfis. Regras particulares serão preservadas.
			</p>
			<CustomSelect
				label="Instituição aprovada"
				onValueChange={setTarget}
				options={(catalog.data ?? [])
					.filter(item => item.status === "APPROVED")
					.map(item => ({ label: item.name, value: item.id }))}
				placeholder="Ex: Banco Inter"
				searchable
				value={target}
			/>
			<ActionGroup>
				<Button
					disabled={!target || pending}
					onClick={() => {
						setPending(true);
						void fetchWithAuth(`/financial-institutions/${institution.id}/merge-proposal`, {
							body: JSON.stringify({ targetId: target }),
							method: "POST",
						})
							.then(() => showToast("Associação enviada para revisão", "positive"))
							.catch(error => showToast(error.message, "negative"))
							.finally(() => setPending(false));
					}}
					type="button"
					variant="outline"
				>
					<LuLink />
					Solicitar associação
				</Button>
			</ActionGroup>
		</section>
	);
}
