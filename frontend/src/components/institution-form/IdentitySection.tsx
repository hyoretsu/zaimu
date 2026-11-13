import { CollapsibleFormSection } from "@/components/ui/CollapsibleFormSection";
import { DebouncedTextField } from "./DebouncedTextField";
import { parseAliases } from "./proposal";
import type { InstitutionFormState } from "./types";

export function IdentitySection({
	disabled,
	onChange,
	state,
}: {
	disabled: boolean;
	onChange: (patch: Partial<InstitutionFormState>) => void;
	state: InstitutionFormState;
}) {
	const aliases = parseAliases(state.aliases);
	return (
		<CollapsibleFormSection
			defaultExpanded
			summary={
				<>
					{state.name.trim() || "Sem nome"}
					{aliases.length > 0 && ` - também conhecida como ${aliases.join(", ")}`}
				</>
			}
			title="Identificação"
		>
			<DebouncedTextField
				disabled={disabled}
				id="institution-form-name"
				label="Nome da instituição"
				maxLength={100}
				name="institution-name"
				onValueChange={name => onChange({ name })}
				placeholder="Ex: Banco Inter"
				required
				value={state.name}
			/>
			<DebouncedTextField
				disabled={disabled}
				id="institution-form-aliases"
				label="Outros nomes (separados por vírgula)"
				name="institution-aliases"
				onValueChange={aliases => onChange({ aliases })}
				placeholder="Ex: Inter, Banco Intermedium"
				value={state.aliases}
			/>
		</CollapsibleFormSection>
	);
}
