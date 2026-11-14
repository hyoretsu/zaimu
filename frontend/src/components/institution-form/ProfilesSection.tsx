import { useState } from "react";
import { LuPlus, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormSection } from "@/components/ui/FormSection";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { showToast } from "@/stores";
import { DebouncedTextField } from "./DebouncedTextField";
import type { ExistingProfile, InstitutionFormState } from "./types";

export function ProfilesSection({
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
		<FormSection
			summary={
				profiles.length + state.newProfiles.length
					? `${profiles.length + state.newProfiles.length} ${profiles.length + state.newProfiles.length === 1 ? "perfil" : "perfis"}${state.newProfiles.length ? ` (${state.newProfiles.length} ${state.newProfiles.length === 1 ? "novo" : "novos"})` : ""}`
					: "Apenas o perfil Padrão"
			}
			title="Perfis"
		>
			<p className="text-muted-foreground text-sm">
				Perfis são planos ou categorias de cliente, como Meli+ ou Prime. Podem ter regras de cartão e
				políticas de rendimento próprias.
			</p>
			<ul className="grid gap-2">
				{profiles.map(profile => (
					<li className="flex items-center gap-3 rounded-xl border p-3" key={profile.id}>
						<span className="min-w-0 flex-1 font-medium break-words">{profile.name}</span>
						{profile.isDefault && <Badge variant="secondary">Padrão</Badge>}
					</li>
				))}
				{state.newProfiles.map(profile => (
					<li className="flex items-center gap-3 rounded-xl border p-3" key={profile.key}>
						<span className="min-w-0 flex-1 font-medium break-words">{profile.name}</span>
						<Badge>Novo</Badge>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label={`Remover perfil ${profile.name}`}
									disabled={disabled}
									onClick={() =>
										onChange({
											newProfiles: state.newProfiles.filter(
												item => item.key !== profile.key,
											),
											policies: state.policies.filter(
												policy =>
													policy.profileName?.toLowerCase() !==
													profile.name.toLowerCase(),
											),
										})
									}
									size="icon-sm"
									type="button"
									variant="outline"
								>
									<LuX />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Remover perfil</TooltipContent>
						</Tooltip>
					</li>
				))}
			</ul>
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
		</FormSection>
	);
}
