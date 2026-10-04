import { createFileRoute, Link } from "@tanstack/react-router";
import { LuArrowRight, LuCircleAlert, LuMail, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import { BrandMark } from "@/components/BrandMark";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";

const deletionRequestHref =
	"mailto:developer@hyoretsu.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta%20Zaimu";

function DeleteAccountPage() {
	return (
		<main className="min-h-dvh bg-background px-5 py-6 sm:px-8 sm:py-10">
			<div className="mx-auto max-w-3xl">
				<header className="mb-8 flex items-center justify-between gap-4">
					<Link aria-label="Ir para entrar" to="/auth">
						<BrandMark />
					</Link>
					<Button asChild variant="outline">
						<Link to="/auth">Entrar</Link>
					</Button>
				</header>

				<article className="rounded-3xl border border-border/70 bg-card p-6 shadow-card sm:p-10">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
						<LuTrash2 className="size-6" />
					</div>
					<h1 className="mt-6 font-bold text-3xl tracking-tight sm:text-4xl">Excluir sua conta</h1>
					<p className="mt-3 max-w-2xl text-foreground/80 leading-7">
						Use esta página para solicitar a exclusão da sua conta Zaimu e dos dados associados.
					</p>

					<section className="mt-8 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
						<div className="flex gap-3">
							<LuMail className="mt-0.5 size-5 shrink-0 text-primary" />
							<div>
								<h2 className="font-semibold text-lg">Como solicitar</h2>
								<ol className="mt-3 list-decimal space-y-2 pl-5 text-foreground/80 leading-6">
									<li>Envie a solicitação usando o e-mail vinculado à sua conta Zaimu.</li>
									<li>Informe que deseja excluir sua conta.</li>
									<li>Após confirmarmos sua identidade, processaremos a solicitação.</li>
								</ol>
							</div>
						</div>
						<ActionGroup className="ml-auto">
							<Button asChild className="mt-5 sm:w-auto" variant="destructive">
								<a href={deletionRequestHref}>
									Solicitar exclusão por e-mail <LuArrowRight />
								</a>
							</Button>
						</ActionGroup>
					</section>

					<section className="mt-8">
						<div className="flex gap-3">
							<LuShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
							<div>
								<h2 className="font-semibold text-xl">Dados excluídos e retenção</h2>
								<div className="mt-3 space-y-3 text-foreground/80 leading-7">
									<p>
										A exclusão remove sua conta e os dados fornecidos por você, como perfil e informações
										financeiras registradas no Zaimu.
									</p>
									<p>
										Dados necessários para cumprir obrigações legais podem ser mantidos pelo prazo exigido.
										Dados técnicos coletados automaticamente podem ser mantidos por até 24 meses; dados
										agregados ou anonimizados podem ser mantidos sem prazo, pois não identificam você.
									</p>
								</div>
							</div>
						</div>
					</section>

					<div className="mt-8 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-foreground/85 text-sm leading-6">
						<LuCircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
						<p>A exclusão da conta é permanente e o acesso aos seus dados não poderá ser restaurado.</p>
					</div>

					<p className="mt-8 text-muted-foreground text-sm">
						Veja também nossa{" "}
						<Link
							className="font-medium text-primary underline underline-offset-4 hover:text-primary/75"
							to="/privacy"
						>
							Política de Privacidade
						</Link>
						.
					</p>
				</article>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/delete-account")({ component: DeleteAccountPage });
