import { LuPlay, LuSettings } from "react-icons/lu";
import { GuideInstruction } from "./GuideInstruction";
import { PluggyLink } from "./PluggyLink";

export function DashboardGuide() {
	return (
		<div className="space-y-4">
			<p>
				Meu Pluggy e Dashboard Pluggy têm cadastros separados. No Dashboard, crie sua conta ou entre antes de
				abrir aplicações. Se cadastro pedir confirmação por email, conclua no mesmo navegador.
			</p>
			<div className="flex flex-wrap gap-2">
				<PluggyLink href="https://dashboard.pluggy.ai/applications">Abrir aplicações do Dashboard</PluggyLink>
				<PluggyLink href="https://meu.pluggy.ai/en/api-guide">Guia MeuPluggy</PluggyLink>
			</div>
			<p className="text-muted-foreground">
				No aplicativo, link abre navegador externo. Depois do cadastro, siga para Aplicações. Se Dashboard não
				continuar automaticamente, use botão acima novamente.
			</p>
			<ol className="grid gap-4 sm:grid-cols-2">
				<GuideInstruction
					image="/open-finance/create-application.jpg"
					number={1}
					title="Crie aplicação chamada Zaimu"
				>
					<p>
						Em Aplicações, escolha criar nova aplicação. Digite <strong>Zaimu</strong> no nome e toque em{" "}
						<strong>Criar</strong>.
					</p>
				</GuideInstruction>
				<GuideInstruction
					image="/open-finance/application-play.jpg"
					number={2}
					title="Abra Demo pelo botão de play"
				>
					<p>
						No cartão da aplicação Zaimu, toque no botão triangular{" "}
						<LuPlay aria-label="play" className="inline size-5 align-text-bottom" /> <strong>de play</strong>,
						à direita do nome, ao lado da engrenagem{" "}
						<LuSettings aria-label="configurações" className="inline size-5 align-text-bottom" />. Esse botão
						abre <strong>Demo</strong>.
					</p>
					<p>
						Engrenagem abre configurações e credenciais. Se MeuPluggy não aparecer na busca, habilite esse
						conector nas configurações da aplicação.
					</p>
				</GuideInstruction>
				<GuideInstruction
					image="/open-finance/demo-connect-account.jpg"
					number={3}
					title="Toque em Conectar Conta"
				>
					<p>
						Na tela Demo, toque no botão rosa <strong>+ Conectar Conta</strong>, no topo.
					</p>
				</GuideInstruction>
				<GuideInstruction
					image="/open-finance/demo-continue.jpg"
					number={4}
					title="Continue na conexão Pluggy"
				>
					<p>
						Leia informações exibidas e toque em <strong>Continuar</strong> para escolher instituição.
					</p>
				</GuideInstruction>
				<GuideInstruction
					image="/open-finance/select-meu-pluggy.jpg"
					number={5}
					title="Busque e escolha MeuPluggy"
				>
					<p>
						Na aba <strong>Pessoal</strong>, busque <strong>Pluggy</strong> e escolha{" "}
						<strong>MeuPluggy</strong>. Autorize acesso às conexões que criou na primeira etapa.
					</p>
				</GuideInstruction>
				<GuideInstruction
					image="/open-finance/application-credentials.jpg"
					number={6}
					title="Copie credenciais e volte ao Zaimu"
				>
					<p>
						Volte para Aplicações. No cartão Zaimu, copie <strong>Client ID</strong> e{" "}
						<strong>Client Secret</strong> usando botões de copiar. Credenciais também ficam na engrenagem,
						seção <strong>Credenciais</strong>.
					</p>
					<p>
						Use credenciais da sua aplicação; fotos mostram exemplo. Cole ambos na próxima etapa. Zaimu
						buscará conexões disponíveis para escolher destinos locais.
					</p>
				</GuideInstruction>
			</ol>
		</div>
	);
}
