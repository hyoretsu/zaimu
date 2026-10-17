import { createFileRoute, Link } from "@tanstack/react-router";
import { type SyntheticEvent, useState } from "react";
import { LuExternalLink, LuKeyRound } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";
import { AuthAlert, AuthShell, PasswordField } from "./components";

export interface ResetSearch {
	token?: string;
}

function ResetPasswordPage() {
	const { token } = Route.useSearch();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [status, setStatus] = useState<"error" | "idle" | "loading" | "success">(token ? "idle" : "error");
	const [message, setMessage] = useState(token ? "" : "Link inválido ou expirado.");

	const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!token) return;
		if (password.length < 8) return setMessage("A senha precisa ter pelo menos 8 caracteres.");
		if (password !== confirmation) return setMessage("As senhas não coincidem.");
		setMessage("");
		setStatus("loading");
		try {
			const { error } = await authClient.resetPassword({ newPassword: password, token });
			if (error) {
				setMessage("Este link é inválido, expirou ou já foi utilizado.");
				setStatus("error");
				return;
			}
			setStatus("success");
		} catch {
			setMessage("Não foi possível conectar. Verifique sua conexão e tente novamente.");
			setStatus("error");
		}
	};

	const openApp = () => {
		window.location.href = `zaimu://auth/reset-password?token=${encodeURIComponent(token ?? "")}`;
	};

	return (
		<AuthShell
			description="O link funciona no navegador e no aplicativo. Redefinir a senha encerra as outras sessões."
			title="Defina uma nova senha"
		>
			{status === "success" ? (
				<div className="grid gap-5">
					<AuthAlert kind="success" message="Senha alterada. Todas as sessões anteriores foram revogadas." />
					<Button asChild className="h-11">
						<Link to="/auth">
							<LuKeyRound /> Entrar com a nova senha
						</Link>
					</Button>
				</div>
			) : (
				<form className="grid gap-5" onSubmit={handleSubmit}>
					{message && <AuthAlert message={message} />}
					<PasswordField
						autoComplete="new-password"
						description="Use pelo menos 8 caracteres."
						id="password"
						label="Nova senha"
						onChange={setPassword}
						placeholder="Crie uma senha segura"
						value={password}
					/>
					<PasswordField
						autoComplete="new-password"
						id="password-confirmation"
						label="Confirmar nova senha"
						onChange={setConfirmation}
						placeholder="Digite a senha novamente"
						value={confirmation}
					/>
					<Button className="h-11" disabled={!token || status === "loading"} size="lg" type="submit">
						{status === "loading" ? "Salvando…" : "Salvar nova senha"}
					</Button>
					{token && (
						<Button className="h-11" onClick={openApp} type="button" variant="outline">
							<LuExternalLink /> Abrir no aplicativo
						</Button>
					)}
					{!token && (
						<Button asChild className="h-11" variant="outline">
							<Link to="/auth/forgot-password">Solicitar novo link</Link>
						</Button>
					)}
				</form>
			)}
		</AuthShell>
	);
}

export const Route = createFileRoute("/auth/reset-password")({
	component: ResetPasswordPage,
	validateSearch: (search: Record<string, unknown>): ResetSearch => ({
		token: typeof search.token === "string" ? search.token : undefined,
	}),
});
