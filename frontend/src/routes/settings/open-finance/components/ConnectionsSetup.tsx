import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuPlus, LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { openFinanceKeys } from "@/hooks/use-open-finance";
import { type OpenFinanceConnection, openFinanceApi } from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { ConnectionForm } from "./ConnectionForm";
import { ConnectionsList } from "./ConnectionsList";

export function ConnectionsSetup({
	connections,
	onSaved,
	onBindingsSaved,
}: {
	connections: OpenFinanceConnection[];
	onSaved: () => Promise<void>;
	onBindingsSaved: () => Promise<void>;
}) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [manual, setManual] = useState(false);
	const discovery = useQuery({
		queryFn: async () => {
			const result = await openFinanceApi.discoverConnections();
			client.setQueryData(openFinanceKeys.configuration(identity), result);
			return result;
		},
		queryKey: ["identity", identity, "open-finance", "discovery"],
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
		retry: false,
	});
	const unavailable = discovery.data?.discoveryAvailable === false;
	const { refetch } = discovery;
	useEffect(() => {
		const refreshOnFocus = () => {
			if (document.visibilityState === "visible") void refetch();
		};
		window.addEventListener("focus", refreshOnFocus);
		return () => window.removeEventListener("focus", refreshOnFocus);
	}, [refetch]);
	return (
		<div className="space-y-4">
			<p>
				Conexões são buscadas ao abrir esta tela e ao voltar do navegador. Selecione uma conta ou cartão do
				Zaimu para cada destino.
			</p>
			<Button
				disabled={discovery.isFetching}
				onClick={async () => {
					const result = await discovery.refetch();
					showToast(
						result.isError
							? "Não foi possível buscar conexões"
							: result.data?.errors.length
								? "Contas atualizadas com pendências"
								: "Contas conectadas atualizadas",
						result.isError || result.data?.errors.length ? "negative" : "positive",
					);
				}}
				variant="outline"
			>
				<LuRefreshCw />
				{discovery.isFetching ? "Buscando contas conectadas..." : "Atualizar contas conectadas"}
			</Button>
			{discovery.isPending && (
				<div aria-label="Buscando contas conectadas" className="space-y-3" role="status">
					<Skeleton className="h-32" />
					<Skeleton className="h-32" />
				</div>
			)}
			{discovery.isError && (
				<p className="text-destructive" role="alert">
					{discovery.error.message}
				</p>
			)}
			{unavailable && (
				<p className="rounded-lg border bg-muted/40 p-3">
					Pluggy exige habilitação da listagem de conexões pelo suporte para sua equipe. Até habilitar, copie
					itemId na Demo e adicione abaixo. Contas de conexões já adicionadas continuam sendo atualizadas
					automaticamente.
				</p>
			)}
			{discovery.data?.errors.map(error => (
				<p className="text-destructive" key={error.itemId} role="alert">
					Conexão {error.itemId}: {error.message}
				</p>
			))}
			{!discovery.isPending && !discovery.isError && !connections.length && !unavailable && (
				<p>
					Nenhuma conexão MeuPluggy encontrada. Conclua autorização na Demo e toque em Atualizar contas
					conectadas.
				</p>
			)}
			{!discovery.isPending && <ConnectionsList connections={connections} onSaved={onBindingsSaved} />}
			{!unavailable && (
				<Button aria-expanded={manual} onClick={() => setManual(value => !value)} variant="outline">
					<LuPlus />
					{manual ? "Minimizar" : "Expandir: adicionar por itemId"}
				</Button>
			)}
			{(manual || unavailable || discovery.isError) && <ConnectionForm onSaved={onSaved} />}
		</div>
	);
}
