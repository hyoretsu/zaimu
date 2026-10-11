import { useState } from "react";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

export function LocalStorageError({ onRetry }: { onRetry: () => Promise<void> }) {
	const [pending, setPending] = useState(false);
	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
			<PageHeader title="Não foi possível abrir o aplicativo" />
			<p role="alert">
				Não conseguimos acessar o armazenamento deste dispositivo. Seus dados não foram apagados. Tente
				novamente.
			</p>
			<ActionGroup className="ml-auto">
				<Button
					disabled={pending}
					onClick={async () => {
						setPending(true);
						try {
							await onRetry();
						} catch {
							// Keep the recoverable storage error visible, without internal details.
						} finally {
							setPending(false);
						}
					}}
				>
					{pending ? "Tentando novamente..." : "Tentar novamente"}
				</Button>
			</ActionGroup>
		</main>
	);
}
