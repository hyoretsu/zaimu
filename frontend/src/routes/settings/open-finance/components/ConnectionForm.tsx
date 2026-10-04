import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { openFinanceApi } from "@/lib/api";
import { showToast } from "@/stores";
export function ConnectionForm({ onSaved }: { onSaved: () => Promise<void> }) {
	const [itemId, setItemId] = useDebouncedInput("", () => undefined);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="space-y-3"
			onSubmit={async event => {
				event.preventDefault();
				setPending(true);
				setError(null);
				try {
					await openFinanceApi.addConnection(itemId.trim());
					setItemId("");
					showToast("Conexão adicionada. Escolha os destinos locais.", "positive");
					await onSaved();
				} catch (error) {
					setError(error instanceof Error ? error.message : "Não foi possível adicionar conexão");
				} finally {
					setPending(false);
				}
			}}
		>
			<FormField
				id="pluggy-item-id"
				label="itemId da conexão"
				name="pluggy-item-id"
				onChange={e => setItemId(e.currentTarget.value)}
				placeholder="Ex: 52a3e951-..."
				required
				type="text"
				value={itemId}
			/>
			{error && (
				<p className="text-destructive" role="alert">
					{error}
				</p>
			)}
			<ActionGroup>
				<Button disabled={pending || !itemId.trim()} type="submit" variant="outline">
					<LuPlus />
					{pending ? "Consultando conexão..." : "Adicionar conexão"}
				</Button>
			</ActionGroup>
		</form>
	);
}
