import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FinancialInstitution } from "@/lib/api";
import { postFinancialInstitutionsByIdPolicies } from "@/lib/api";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { InstitutionYieldEditor } from "@/routes/accounts/components/InstitutionYieldDialog/InstitutionYieldEditor";
import { toPolicyProposalBody } from "@/routes/accounts/components/InstitutionYieldDialog/policy-proposal";
import { showToast } from "@/stores";
import { InstitutionPicker } from "./InstitutionPicker";

export function PolicySuggestionForm({ onClose }: { onClose: () => void }) {
	const queryClient = useQueryClient();
	const [institution, setInstitution] = useState<FinancialInstitution>();
	return (
		<div className="grid gap-3">
			<InstitutionPicker
				filter={item => item.status === "APPROVED"}
				onChange={setInstitution}
				value={institution?.id}
			/>
			{institution && (
				<InstitutionYieldEditor
					institution={institution}
					key={institution.id}
					onClose={onClose}
					onUpdate={async (item, policy) => {
						const start = captureCacheMutation();
						try {
							await postFinancialInstitutionsByIdPolicies({
								body: toPolicyProposalBody(policy),
								path: { id: item.id },
							}).then(result => result.data);
							showToast("Sugestão enviada para revisão administrativa", "positive");
							await invalidateMutationCache(queryClient, start, {
								...mutationCacheMeta("institution"),
								awaitRefetch: true,
							});
						} catch (error) {
							showToast(
								error instanceof Error ? error.message : "Não foi possível enviar a sugestão",
								"negative",
							);
							throw error;
						}
					}}
				/>
			)}
		</div>
	);
}
