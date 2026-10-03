import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { type OpenFinanceConnection, openFinanceApi } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { AccountBindingRow } from "./AccountBindingRow";
export function ConnectionsList({
	connections,
	onSaved,
}: {
	connections: OpenFinanceConnection[];
	onSaved: () => Promise<void>;
}) {
	const identity = useCacheIdentity();
	const accounts = useQuery({
		enabled: Boolean(identity),
		queryFn: dataService.accounts.getAll,
		queryKey: queryKeys.accounts.all(identity!),
	});
	const [removing, setRemoving] = useState<Set<string>>(new Set());
	if (accounts.isPending)
		return (
			<div className="space-y-3">
				<Skeleton className="h-32" />
				<Skeleton className="h-32" />
			</div>
		);
	if (accounts.isError)
		return <p role="alert">Não foi possível carregar destinos locais: {accounts.error.message}</p>;
	return (
		<div className="space-y-4">
			{connections.map(connection => (
				<section className="space-y-4 rounded-xl border p-4" key={connection.id}>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h3 className="font-semibold">{connection.bankName}</h3>
							<p className="text-muted-foreground text-xs">
								Última atualização bancária:{" "}
								{connection.bankUpdatedAt
									? new Date(connection.bankUpdatedAt).toLocaleString("pt-BR")
									: "Ainda não informada"}
							</p>
							<p className="text-muted-foreground text-xs">
								{connection.status === "UPDATED"
									? "Conexão atualizada"
									: connection.status === "UPDATING"
										? "Banco atualizando dados"
										: "Confira autorização no Meu Pluggy"}
							</p>
						</div>
						<ConfirmActionButton
							confirmation="Remover conexão e vínculos? Histórico será preservado."
							confirmChildren={
								<>
									<LuTrash2 />
									Confirmar
								</>
							}
							disabled={removing.has(connection.id)}
							onConfirm={async () => {
								setRemoving(ids => new Set(ids).add(connection.id));
								try {
									await openFinanceApi.disconnect(connection.id);
									showToast("Conexão removida", "positive");
									await onSaved();
								} catch (error) {
									showToast(
										error instanceof Error ? error.message : "Não foi possível remover conexão",
										"negative",
									);
								} finally {
									setRemoving(ids => {
										const next = new Set(ids);
										next.delete(connection.id);
										return next;
									});
								}
							}}
							size="sm"
							variant="outline"
						>
							<LuTrash2 />
							Remover conexão
						</ConfirmActionButton>
					</div>
					{connection.remoteAccounts.length ? (
						connection.remoteAccounts.map(account => (
							<AccountBindingRow
								account={account}
								connection={connection}
								destinations={accounts.data ?? []}
								key={`${account.id}:${JSON.stringify(connection.bindings.find(b => b.remoteAccountId === account.id))}`}
								onSaved={onSaved}
							/>
						))
					) : (
						<p>Sem contas disponíveis. Confira autorização no Meu Pluggy.</p>
					)}
				</section>
			))}
		</div>
	);
}
