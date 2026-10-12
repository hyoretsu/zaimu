import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
export function ProfileProposalForm({ institutionId }: { institutionId: string }) {
	const [name, setName] = useDebouncedInput("", () => undefined);
	const [saving, setSaving] = useState(false);
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
						setSaving(true);
						void fetchWithAuth(`/financial-institutions/${institutionId}/profiles`, {
							body: JSON.stringify({ name: name.trim() }),
							method: "POST",
						})
							.then(() => {
								setName("");
								showToast("Perfil proposto para revisão", "positive");
							})
							.catch(error => showToast(error.message, "negative"))
							.finally(() => setSaving(false));
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
