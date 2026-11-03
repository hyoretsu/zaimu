import { useState } from "react";
import { LuSend } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { postFinancialInstitutions } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { useCacheIdentity } from "@/lib/query-cache";

export function NewInstitutionSuggestionForm({ onClose }: { onClose: () => void }) {
	const [name, setName] = useState("");
	const identity = useCacheIdentity();
	const pending = useModalRecoveryStore(state => !!state.pending[`${identity}:institution-suggestion:new`]);
	const trimmed = name.trim();
	return (
		<div className="grid gap-3">
			<FormField
				id="suggest-institution-name"
				label="Nome da instituição"
				maxLength={100}
				name="suggest-institution-name"
				onChange={event => setName(event.currentTarget.value)}
				placeholder="Ex: Banco Inter"
				type="text"
				value={name}
			/>
			<p className="text-muted-foreground text-sm">
				A instituição fica privada para você até um admin aprovar a sugestão.
			</p>
			<ActionGroup>
				<Button
					disabled={pending || !trimmed || trimmed.length > 100}
					onClick={() =>
						runBackgroundModalAction({
							close: onClose,
							conflictKey: "institution-suggestion:new",
							failureMessage: "Não foi possível enviar a sugestão.",
							loadingMessage: "Enviando sugestão...",
							recovery: { kind: "institution-suggestion:new", payload: { name: trimmed } },
							run: () =>
								postFinancialInstitutions({ body: { name: trimmed } }).then(
									result => result.data,
								),
							successMessage: "Instituição sugerida para revisão.",
						})
					}
					type="button"
				>
					<LuSend />
					Enviar sugestão
				</Button>
			</ActionGroup>
		</div>
	);
}
