import { createFileRoute, Link } from "@tanstack/react-router";
import { type SyntheticEvent, useState } from "react";
import { LuArrowLeft, LuMail } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { authClient, publicWebUrl } from "@/lib/auth-client";
import { AuthAlert, AuthShell } from "./components";

function ForgotPasswordPage() {
	const [email, setEmail] = useDebouncedInput("", () => undefined);
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);

	const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		setLoading(true);
		try {
			await authClient.requestPasswordReset({
				email: email.trim(),
				redirectTo: `${publicWebUrl}/auth/reset-password`,
			});
		} catch {
			// Keep the same response to avoid disclosing whether the account exists.
		} finally {
			setLoading(false);
			setSent(true);
		}
	};

	return (
		<AuthShell
			description="Enviaremos um link de uso único. A resposta é a mesma mesmo quando o endereço não está cadastrado."
			title="Recupere sua senha"
		>
			{sent ? (
				<div className="grid gap-5">
					<AuthAlert
						kind="success"
						message="Se existir uma conta para esse e-mail, o link chegará em instantes."
					/>
					<Button asChild className="h-11" variant="outline">
						<Link to="/auth">
							<LuArrowLeft /> Voltar para entrar
						</Link>
					</Button>
				</div>
			) : (
				<form className="grid gap-5" onSubmit={handleSubmit}>
					<FormField
						autoComplete="email"
						id="email"
						label="E-mail"
						leading={<LuMail className="size-4" />}
						name="email"
						onChange={event => setEmail(event.currentTarget.value)}
						placeholder="voce@exemplo.com"
						required
						type="email"
						value={email}
					/>
					<Button className="h-11" disabled={loading} size="lg" type="submit">
						{loading ? "Enviando…" : "Enviar link de recuperação"}
					</Button>
					<Button asChild className="h-11" variant="outline">
						<Link to="/auth">
							<LuArrowLeft /> Voltar
						</Link>
					</Button>
				</form>
			)}
		</AuthShell>
	);
}

export const Route = createFileRoute("/auth/forgot-password")({ component: ForgotPasswordPage });
