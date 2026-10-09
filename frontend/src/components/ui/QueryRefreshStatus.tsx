import { LuRefreshCw } from "react-icons/lu";
import { showToast } from "@/stores";
import { ActionGroup } from "./ActionGroup";
import { Button } from "./Button";

interface QueryRefreshStatusProps {
	error: boolean;
	pending: boolean;
	onRetry: () => unknown;
}

export function QueryRefreshStatus({ error, pending, onRetry }: QueryRefreshStatusProps) {
	return (
		<ActionGroup className="min-h-9 text-muted-foreground text-sm" role="status">
			{error ? (
				<>
					<span>Atualização falhou. Dados anteriores continuam disponíveis.</span>
					<Button
						disabled={pending}
						onClick={() => {
							onRetry();
							showToast("Atualização solicitada.", "info");
						}}
						size="sm"
						variant="outline"
					>
						<LuRefreshCw /> Tentar novamente
					</Button>
				</>
			) : pending ? (
				<span>Atualizando dados...</span>
			) : null}
		</ActionGroup>
	);
}
