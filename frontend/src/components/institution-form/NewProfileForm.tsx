import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/stores";
import { DebouncedTextField } from "./DebouncedTextField";
import type { ExistingProfile, InstitutionFormState } from "./types";

/** Name field plus button that adds a new profile to the edit. */
export function NewProfileForm({
	disabled,
	onChange,
	profiles,
	state,
}: {
	disabled: boolean;
	onChange: (patch: Partial<InstitutionFormState>) => void;
	profiles: ExistingProfile[];
	state: InstitutionFormState;
}) {
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const taken = (value: string) =>
		[...profiles, ...state.newProfiles].some(
			profile => profile.name.trim().toLowerCase() === value.trim().toLowerCase(),
		);
	const add = () => {
		const trimmed = name.trim();
		if (!trimmed || trimmed.length > 100) {
			setError("Informe um nome com até 100 caracteres.");
			return;
		}
		if (taken(trimmed)) {
			setError("Já existe um perfil com esse nome.");
			return;
		}
		setError("");
		onChange({
			newProfiles: [...state.newProfiles, { key: crypto.randomUUID(), name: trimmed, rules: null }],
		});
		setName("");
		showToast("Perfil adicionado à edição", "info");
	};
	return (
		<>
			<DebouncedTextField
				disabled={disabled}
				error={error}
				id="institution-form-new-profile"
				label="Novo perfil"
				maxLength={100}
				name="new-profile-name"
				onValueChange={value => {
					setName(value);
					setError("");
				}}
				placeholder="Ex: Meli+"
				value={name}
			/>
			<ActionGroup>
				<Button disabled={disabled} onClick={add} type="button" variant="outline">
					<LuPlus />
					Adicionar perfil
				</Button>
			</ActionGroup>
		</>
	);
}
