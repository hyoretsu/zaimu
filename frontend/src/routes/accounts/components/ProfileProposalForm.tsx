import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { postFinancialInstitutionsByIdProfiles } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { useCacheIdentity } from "@/lib/query-cache";
export function ProfileProposalForm({
	institutionId,
	initialName = "",
	onClose,
}: {
	institutionId: string;
	initialName?: string;
	onClose: () => void;
}) {
	const [name, setName] = useDebouncedInput(initialName, () => undefined);
	const identity = useCacheIdentity();
	const saving = useModalRecoveryStore(
		state => !!state.pending[`${identity}:institution-proposal:${institutionId}`],
	);
	return (
		<div className="grid gap-3 rounded-xl border p-3">
			<FormField
				id={`new-profile-${institutionId}`}
				label="Propor novo perfil"
				name="new-profile-name"
				onChange={event => setName(event.currentTarget.value)}
				placeholder="Ex: Meli+"
				type="text"
				value={name}
			/>
			<ActionGroup>
				<Button
					disabled={saving || !name.trim()}
					onClick={() => {
						const draft = { name: name.trim() };
						runBackgroundModalAction({
							close: onClose,
							conflictKey: `institution-proposal:${institutionId}`,
							failureMessage: "Não foi possível propor perfil.",
							loadingMessage: "Enviando proposta...",
							recovery: {
								entityId: institutionId,
								kind: `institution-profile:${institutionId}`,
								payload: draft,
							},
							run: () => postFinancialInstitutionsByIdProfiles(institutionId, draft),
							successMessage: "Perfil proposto para revisão.",
						});
					}}
					type="button"
					variant="outline"
				>
					<LuPlus />
					Propor perfil
				</Button>
			</ActionGroup>
		</div>
	);
}
