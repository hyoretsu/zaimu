import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuExternalLink, LuMailCheck } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";
import { AuthAlert, AuthShell } from "./components";

export interface VerifySearch {
	sent?: string;
	token?: string;
}

function VerifyEmailPage() {
	const { sent, token } = Route.useSearch();
	const [status, setStatus] = useState<"error" | "loading" | "pending" | "success">(
		token ? "loading" : "pending",
	);

	useEffect(() => {
		if (!token) return;
		const controller = new AbortController();
		void authClient
			.verifyEmail({
				fetchOptions: { signal: controller.signal },
				query: { token },
			})
			.then(
				({ error }) => {
					if (!controller.signal.aborted) setStatus(error ? "error" : "success");
				},
				() => {
					if (!controller.signal.aborted) setStatus("error");
				},
			);
		return () => controller.abort();
	}, [token]);

	const openApp = () => {
		window.location.href = `zaimu://auth/verify-email?token=${encodeURIComponent(token ?? "")}`;
	};

	const content = {
		error: {
			description: "Este link é inválido, expirou ou já foi utilizado.",
			title: "Não foi possível confirmar",
		},
		loading: { description: "Validando seu link de uso único…", title: "Confirmando e-mail" },
		pending: {
			description: sent
				? `Enviamos o link para ${sent}. Verifique também a caixa de spam.`
				: "Abra o link enviado ao seu e-mail para concluir o cadastro.",
			title: "Confira seu e-mail",
		},
		success: {
			description: "Seu endereço foi confirmado. Agora você já pode entrar com segurança.",
			title: "E-mail confirmado",
		},
	}[status];

	return (
		<AuthShell description={content.description} title={content.title}>
			<div className="grid gap-5">
				<div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
					<LuMailCheck className="size-8" />
				</div>
				{status === "success" && (
					<AuthAlert kind="success" message="Confirmação concluída. O token não pode ser reutilizado." />
				)}
				{status === "error" && <AuthAlert message="Solicite outro link e tente novamente." />}
				{status === "success" && (
					<Button asChild className="h-11">
						<Link to="/auth">Entrar</Link>
					</Button>
				)}
				{status === "error" && (
					<Button asChild className="h-11">
						<Link to="/auth/register">Criar conta ou reenviar confirmação</Link>
					</Button>
				)}
				{token && status !== "loading" && (
					<Button className="h-11" onClick={openApp} type="button" variant="outline">
						<LuExternalLink /> Abrir no aplicativo
					</Button>
				)}
				{status === "pending" && (
					<Button asChild className="h-11" variant="outline">
						<Link to="/auth">Voltar para entrar</Link>
					</Button>
				)}
			</div>
		</AuthShell>
	);
}

export const Route = createFileRoute("/auth/verify-email")({
	component: VerifyEmailPage,
	validateSearch: (search: Record<string, unknown>): VerifySearch => ({
		sent: typeof search.sent === "string" ? search.sent : undefined,
		token: typeof search.token === "string" ? search.token : undefined,
	}),
});
