import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function LocalStorageError({ onRetry }: { onRetry: () => Promise<void> }) {
	const [pending, setPending] = useState(false);
	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
			<h1 className="font-semibold text-xl">Não foi possível abrir o aplicativo</h1>
			<p role="alert">
				Não conseguimos acessar o armazenamento deste dispositivo. Seus dados não foram apagados. Tente
				novamente.
			</p>
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
		</main>
	);
}
