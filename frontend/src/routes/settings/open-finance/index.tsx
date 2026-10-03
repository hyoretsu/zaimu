import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuUnplug } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { openFinanceKeys, useOpenFinanceConfiguration } from "@/hooks/use-open-finance";
import { openFinanceApi } from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast, useAuthStore } from "@/stores";
import {
	ConnectionsSetup,
	CredentialsForm,
	DashboardGuide,
	GuideStep,
	OpenFinanceLayout,
	PluggyLink,
	SyncProgress,
} from "./components";
export function OpenFinancePage() {
	const authenticated = useAuthStore(s => s.isAuthenticated);
	const identity = useCacheIdentity();
	const configuration = useOpenFinanceConfiguration();
	const client = useQueryClient();
	const [disconnecting, setDisconnecting] = useState(false);
	const refresh = async () => {
		await client.invalidateQueries({ queryKey: openFinanceKeys.configuration(identity) });
	};
	const finishBindings = async () => {
		await refresh();
		await openFinanceApi.sync(true);
		await client.invalidateQueries({ queryKey: openFinanceKeys.status(identity) });
	};
	if (!authenticated)
		return (
			<OpenFinanceLayout>
				<PageHeader title="Open Finance" />
				<p>Entre em sua conta para conectar bancos ao Meu Pluggy.</p>
				<Button asChild>
					<Link to="/auth">Entrar</Link>
				</Button>
			</OpenFinanceLayout>
		);
	if (configuration.isPending)
		return (
			<OpenFinanceLayout>
				<Skeleton className="h-20" />
				<Skeleton className="h-32" />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</OpenFinanceLayout>
		);
	if (configuration.isError)
		return (
			<OpenFinanceLayout>
				<p role="alert">{configuration.error.message}</p>
				<Button onClick={() => void configuration.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</OpenFinanceLayout>
		);
	const config = configuration.data;
	return (
		<OpenFinanceLayout>
			<PageHeader
				description="Meu Pluggy: conecte seus bancos e importe seu histórico automaticamente."
				eyebrow="Ajustes"
				title="Open Finance"
			/>
			{!config.available ? (
				<p>
					Integração indisponível neste servidor. Administrador precisa configurar a chave de criptografia.
				</p>
			) : (
				<div className="space-y-5">
					<GuideStep number={1} title="Conecte bancos no Meu Pluggy">
						<div className="space-y-3">
							<div className="inline-flex rounded-lg bg-white px-3 py-2">
								<img
									alt="Meu Pluggy"
									className="h-8 w-auto"
									height={32}
									src="/open-finance/meu-pluggy-logo.svg"
									width={163}
								/>
							</div>
							<p>
								Meu Pluggy é plataforma da Pluggy que reúne suas contas e cartões bancários em um lugar. Você
								autoriza conexão com bancos lá; Zaimu usa essas conexões para importar histórico financeiro.
							</p>
							<ol className="list-decimal space-y-2 pl-5">
								<li>Abra Meu Pluggy, crie conta ou entre.</li>
								<li>Conecte cada banco e conclua autorização no aplicativo bancário.</li>
								<li>Confira contas, cartões e extratos antes de continuar.</li>
							</ol>
							<PluggyLink href="https://meu.pluggy.ai/overview">Abrir Meu Pluggy</PluggyLink>
						</div>
					</GuideStep>
					<GuideStep number={2} title="Crie aplicação no Dashboard">
						<DashboardGuide />
					</GuideStep>
					<GuideStep number={3} title="Valide credenciais">
						<CredentialsForm configured={config.configured} onSaved={refresh} />
					</GuideStep>
					<GuideStep number={4} title="Adicione conexões e vincule destinos">
						{config.configured ? (
							<ConnectionsSetup
								connections={config.connections}
								onBindingsSaved={finishBindings}
								onSaved={refresh}
							/>
						) : (
							<p>Valide credenciais na etapa anterior para adicionar conexões.</p>
						)}
						<p className="text-muted-foreground">
							Contas sem vínculo não serão importadas. Vínculos recém-salvos iniciam uma busca.
						</p>
					</GuideStep>
					{config.configured && (
						<>
							<p className="text-muted-foreground text-sm">
								Última consulta Zaimu:{" "}
								{config.lastQueriedAt
									? new Date(config.lastQueriedAt).toLocaleString("pt-BR")
									: "Ainda não realizada"}
							</p>
							<SyncProgress onChanged={refresh} />
							<ConfirmActionButton
								confirmation="Desconectar integração e apagar credenciais e vínculos? Histórico será preservado."
								confirmChildren={
									<>
										<LuUnplug />
										Confirmar
									</>
								}
								disabled={disconnecting}
								onConfirm={async () => {
									setDisconnecting(true);
									try {
										await openFinanceApi.disconnect();
										showToast("Integração desconectada. Histórico preservado.", "positive");
										await refresh();
									} catch (error) {
										showToast(
											error instanceof Error ? error.message : "Não foi possível desconectar",
											"negative",
										);
									} finally {
										setDisconnecting(false);
									}
								}}
								variant="outline"
							>
								<LuUnplug />
								Desconectar integração
							</ConfirmActionButton>
						</>
					)}
				</div>
			)}
		</OpenFinanceLayout>
	);
}
export const Route = createFileRoute("/settings/open-finance/")({ component: OpenFinancePage });
