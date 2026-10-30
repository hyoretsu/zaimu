import { useState } from "react";
import { ProfileProposalForm } from "@/routes/accounts/components/ProfileProposalForm";
import { InstitutionPicker } from "./InstitutionPicker";

export function ProfileSuggestionForm({ onClose }: { onClose: () => void }) {
	const [institutionId, setInstitutionId] = useState<string>();
	return (
		<div className="grid gap-3">
			<InstitutionPicker
				filter={item => item.status === "APPROVED"}
				onChange={item => setInstitutionId(item?.id)}
				value={institutionId}
			/>
			{institutionId && (
				<ProfileProposalForm institutionId={institutionId} key={institutionId} onClose={onClose} />
			)}
		</div>
	);
}
