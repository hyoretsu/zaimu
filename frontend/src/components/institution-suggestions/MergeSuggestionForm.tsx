import { useState } from "react";
import type { FinancialInstitution } from "@/lib/api";
import { InstitutionMergeProposal } from "@/routes/accounts/components/InstitutionMergeProposal";
import { InstitutionPicker } from "./InstitutionPicker";

export function MergeSuggestionForm({ onClose }: { onClose: () => void }) {
	const [institution, setInstitution] = useState<FinancialInstitution>();
	return (
		<div className="grid gap-3">
			<InstitutionPicker
				filter={item => item.status === "LEGACY_PRIVATE"}
				label="Sua instituição"
				onChange={setInstitution}
				value={institution?.id}
			/>
			{institution && (
				<InstitutionMergeProposal institution={institution} key={institution.id} onClose={onClose} />
			)}
		</div>
	);
}
