import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuLink } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type { FinancialInstitution } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService, fetchWithAuth } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";

export function InstitutionMergeProposal({
	institution,
	initialTarget,
	onClose,
}: {
	institution: FinancialInstitution;
	initialTarget?: string;
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const [target, setTarget] = useState<string | undefined>(initialTarget);
	const pending = useModalRecoveryStore(
		state => !!state.pending[`${identity}:institution-merge:${institution.id}`],
	);
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
						const draft = { target };
						runBackgroundModalAction({
							close: onClose,
							conflictKey: `institution-merge:${institution.id}`,
							failureMessage: "Não foi possível solicitar associação.",
							loadingMessage: "Enviando associação...",
							recovery: {
								entityId: institution.id,
								kind: `institution-profile:${institution.id}`,
								payload: draft,
							},
							run: () =>
								fetchWithAuth(`/financial-institutions/${institution.id}/merge-proposal`, {
									body: JSON.stringify({ targetId: draft.target }),
									method: "POST",
								}),
							successMessage: "Associação enviada para revisão.",
						});
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
