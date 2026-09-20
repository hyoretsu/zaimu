import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type SyntheticEvent, useState } from "react";
import { LuArrowRight, LuMail, LuSmartphone } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { dataService } from "@/lib/dataService";
import { useAuthStore } from "@/stores";
import { AuthAlert, AuthShell, PasswordField } from "./components";

function LoginPage() {
	const navigate = useNavigate();
	const { clearError, enableGuestMode, error, isLoading, login } = useAuthStore();
	const [email, setEmail] = useDebouncedInput("", clearError);
	const [password, setPassword] = useState("");

	const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!(await login(email.trim(), password))) return;
		void dataService.sync.syncAll();
		await navigate({ to: "/" });
	};

	const continueAsGuest = async () => {
		enableGuestMode();
		await navigate({ to: "/" });
	};

	return (
		<AuthShell
			description="Acesse seu painel com segurança ou continue usando seus dados locais."
			title="Que bom ter você de volta"
		>
			<form className="grid gap-5" onSubmit={handleSubmit}>
				{error && <AuthAlert message={error} />}
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
				<PasswordField
					autoComplete="current-password"
					id="password"
					label="Senha"
					onChange={setPassword}
					placeholder="Digite sua senha"
					value={password}
				/>
				<div className="flex justify-end">
					<Link className="font-semibold text-primary text-sm hover:underline" to="/auth/forgot-password">
						Esqueci minha senha
					</Link>
				</div>
				<Button className="h-11 w-full" disabled={isLoading} size="lg" type="submit">
					{isLoading ? "Entrando…" : "Entrar"} <LuArrowRight />
				</Button>
			</form>
			<div className="my-6 flex items-center gap-3 text-muted-foreground text-xs">
				<span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
			</div>
			<Button className="h-11 w-full" onClick={continueAsGuest} size="lg" type="button" variant="outline">
				<LuSmartphone /> Continuar como convidado
			</Button>
			<p className="mt-6 text-center text-muted-foreground text-sm">
				Ainda não tem conta?{" "}
				<Link className="font-semibold text-primary hover:underline" to="/auth/register">
					Criar conta
				</Link>
			</p>
		</AuthShell>
	);
}

export const Route = createFileRoute("/auth/")({ component: LoginPage });
