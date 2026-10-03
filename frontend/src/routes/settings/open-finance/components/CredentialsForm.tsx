import { useState } from "react";
import { LuKeyRound } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { openFinanceApi } from "@/lib/api";
import { showToast } from "@/stores";
export function CredentialsForm({
	configured,
	onSaved,
}: {
	configured: boolean;
	onSaved: () => Promise<void>;
}) {
	const [clientId, setClientId] = useDebouncedInput("", () => undefined);
	const [secret, setSecret] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="space-y-4"
			onSubmit={async event => {
				event.preventDefault();
				setPending(true);
				setError(null);
				try {
					await openFinanceApi.saveCredentials(clientId.trim(), secret.trim());
					setSecret("");
					setClientId("");
					showToast("Credenciais validadas e salvas", "positive");
					await onSaved();
				} catch (error) {
					setError(error instanceof Error ? error.message : "Não foi possível validar credenciais");
				} finally {
					setPending(false);
				}
			}}
		>
			<p className="text-muted-foreground">
				{configured
					? "Credenciais já configuradas. Preencha ambos os campos para substituí-las."
					: "Copie as credenciais da aplicação. Serão cifradas no servidor."}
			</p>
			<FormField
				id="pluggy-client-id"
				label="Client ID"
				name="pluggy-client-id"
				onChange={e => setClientId(e.currentTarget.value)}
				placeholder="Ex: 8fb48e4d-..."
				required
				type="text"
				value={clientId}
			/>
			<FormField
				autoComplete="new-password"
				id="pluggy-client-secret"
				label="Client Secret"
				name="pluggy-client-secret"
				onChange={e => setSecret(e.currentTarget.value)}
				placeholder="Cole o Client Secret da aplicação"
				required
				type="password"
				value={secret}
			/>
			{error && (
				<p className="text-destructive" role="alert">
					{error}
				</p>
			)}
			<Button disabled={pending || !clientId.trim() || !secret.trim()} type="submit">
				<LuKeyRound />
				{pending ? "Validando credenciais..." : "Validar e salvar"}
			</Button>
		</form>
	);
}
