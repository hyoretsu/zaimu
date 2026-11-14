import { createFileRoute, Link } from "@tanstack/react-router";
import { LuArrowRight, LuCircleAlert, LuMail, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import { PublicPageLayout } from "@/components/layout/PublicPageLayout";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

const deletionRequestHref =
	"mailto:developer@hyoretsu.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta%20Zaimu";

function DeleteAccountPage() {
	return (
		<PublicPageLayout>
			<article className="border-border/70 bg-card shadow-card rounded-3xl border p-6 sm:p-10">
				<div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-2xl">
					<LuTrash2 className="size-6" />
				</div>
				<PageHeader
					className="mt-6"
					description="Use esta página para solicitar a exclusão da sua conta Zaimu e dos dados associados."
					title="Excluir sua conta"
				/>

				<section className="border-border bg-muted/30 mt-8 rounded-2xl border p-5 sm:p-6">
					<div className="flex gap-3">
						<LuMail className="text-primary mt-0.5 size-5 shrink-0" />
						<div>
							<h2 className="text-lg font-semibold">Como solicitar</h2>
							<ol className="text-foreground/80 mt-3 list-decimal space-y-2 pl-5 leading-6">
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
						<LuShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
						<div>
							<h2 className="text-xl font-semibold">Dados excluídos e retenção</h2>
							<div className="text-foreground/80 mt-3 space-y-3 leading-7">
								<p>
									A exclusão remove sua conta e os dados fornecidos por você, como perfil e
									informações financeiras registradas no Zaimu.
								</p>
								<p>
									Dados necessários para cumprir obrigações legais podem ser mantidos pelo
									prazo exigido. Dados técnicos coletados automaticamente podem ser mantidos
									por até 24 meses; dados agregados ou anonimizados podem ser mantidos sem
									prazo, pois não identificam você.
								</p>
							</div>
						</div>
					</div>
				</section>

				<div className="text-foreground/85 mt-8 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6">
					<LuCircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
					<p>
						A exclusão da conta é permanente e o acesso aos seus dados não poderá ser restaurado.
					</p>
				</div>

				<p className="text-muted-foreground mt-8 text-sm">
					Veja também nossa{" "}
					<Link
						className="text-primary hover:text-primary/75 font-medium underline underline-offset-4"
						to="/privacy"
					>
						Política de Privacidade
					</Link>
					.
				</p>
			</article>
		</PublicPageLayout>
	);
}

export const Route = createFileRoute("/delete-account")({ component: DeleteAccountPage });
