import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";

export function SessionUnavailable({ onRetry, pending }: { onRetry: () => Promise<void>; pending: boolean }) {
	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
			<h1 className="font-semibold text-xl">Não foi possível validar sua sessão</h1>
			<p role="alert">Servidor indisponível. Aguarde um instante e tente novamente.</p>
			<ActionGroup>
				<Button disabled={pending} onClick={() => void onRetry()}>
					{pending ? "Tentando novamente..." : "Tentar novamente"}
				</Button>
			</ActionGroup>
		</main>
	);
}
