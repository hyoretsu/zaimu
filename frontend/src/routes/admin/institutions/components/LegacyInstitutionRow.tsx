import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuGlobe, LuLink } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { postFinancialInstitutionsReviewLegacyById } from "@/lib/api";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { showToast } from "@/stores";
import type { AdminInstitution } from "./types";

const publishOption = "publish-global";

export function LegacyInstitutionRow({
	institution,
	approvedInstitutions,
}: {
	institution: AdminInstitution;
	approvedInstitutions: AdminInstitution[];
}) {
	const queryClient = useQueryClient();
	const [target, setTarget] = useState(publishOption);
	const [pending, setPending] = useState(false);
	const publish = target === publishOption;
	const consolidate = async () => {
		const start = captureCacheMutation();
		setPending(true);
		try {
			await postFinancialInstitutionsReviewLegacyById(institution.id, publish ? {} : { targetId: target });
			showToast(
				publish ? "Instituição publicada no catálogo global" : "Instituição associada ao catálogo global",
				"positive",
			);
			await invalidateMutationCache(queryClient, start, {
				...mutationCacheMeta("institution"),
				awaitRefetch: true,
			});
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Não foi possível consolidar a instituição",
				"negative",
			);
		} finally {
			setPending(false);
		}
	};
	return (
		<article className="grid min-w-0 gap-3 rounded-xl border p-4">
			<div className="min-w-0 space-y-1">
				<h3 className="break-words font-semibold">{institution.name}</h3>
				<p className="break-words text-muted-foreground text-sm">
					{institution.currency ?? "Moeda não definida"} - Cadastro antigo
				</p>
				<p className="break-all text-muted-foreground text-sm">
					Usuário: {institution.userId ?? "Não informado"}
				</p>
			</div>
			<CustomSelect
				disabled={pending}
				label="Destino no catálogo global"
				onValueChange={setTarget}
				options={[
					{ label: "Publicar no catálogo global", special: true, value: publishOption },
					...approvedInstitutions.map(item => ({
						label: `${item.name} - ${item.currency ?? "Moeda não definida"}`,
						value: item.id,
					})),
				]}
				placeholder="Ex: Banco Inter"
				searchable
				value={target}
			/>
			<ActionGroup>
				<Button disabled={pending} onClick={() => void consolidate()} type="button">
					{publish ? <LuGlobe /> : <LuLink />}
					{pending ? "Processando..." : publish ? "Publicar" : "Associar"}
				</Button>
			</ActionGroup>
		</article>
	);
}
