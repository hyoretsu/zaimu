import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	HiArrowPath,
	HiArrowRightOnRectangle,
	HiBell,
	HiCheck,
	HiChevronRight,
	HiCloudArrowUp,
	HiDevicePhoneMobile,
	HiMoon,
	HiQuestionMarkCircle,
	HiShieldCheck,
	HiSun,
	HiUser,
} from "react-icons/hi2";
import { dataService } from "@/lib/dataService";
import { type ThemeMode, useAuthStore, useThemeStore } from "@/stores";

const themeOptions: { id: ThemeMode; label: string; icon: typeof HiSun; description: string }[] = [
	{ description: "Sempre usar tema claro", icon: HiSun, id: "light", label: "Claro" },
	{ description: "Sempre usar tema escuro", icon: HiMoon, id: "dark", label: "Escuro" },
	{
		description: "Acompanhar configuração do dispositivo",
		icon: HiDevicePhoneMobile,
		id: "system",
		label: "Sistema",
	},
];

export function AjustesPage() {
	const navigate = useNavigate();
	const { user, logout, isGuestMode, isAuthenticated } = useAuthStore();
	const { mode, setMode, resolvedTheme } = useThemeStore();
	const [notifications, setNotificações] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);

	const handleLogout = async () => {
		await dataService.sync.clearLocalData();
		logout();
		navigate({ to: "/auth" });
	};

	const handleSync = async () => {
		if (!isAuthenticated) return;
		setIsSyncing(true);
		try {
			const result = await dataService.sync.syncAll();
			if (result.errors.length > 0) {
				console.error("Sync errors:", result.errors);
			}
		} finally {
			setIsSyncing(false);
		}
	};

	const handleUpgradeToAccount = () => {
		navigate({ to: "/auth" });
	};

	const settingsGroups = [
		{
			items: [
				{
					action: () => {
						void navigate({ to: "/settings/open-finance" });
					},
					description: "Conecte bancos com Meu Pluggy",
					icon: HiCloudArrowUp,
					label: "Open Finance",
				},
				{
					action: () => {},
					description: "Gerencie seus dados pessoais",
					icon: HiUser,
					label: "Perfil",
				},
				{
					action: () => {},
					description: "Senha e autenticação",
					icon: HiShieldCheck,
					label: "Segurança",
				},
			],
			title: "Conta financeira",
		},
		{
			items: [
				{
					action: () => {},
					description: "Encontre ajuda e respostas",
					icon: HiQuestionMarkCircle,
					label: "Help & FAQ",
				},
			],
			title: "Suporte",
		},
	];

	return (
		<div className="mx-auto min-h-screen w-full max-w-5xl bg-background lg:py-10">
			{/* Header */}
			<div className="gradient-primary relative overflow-hidden px-4 pt-12 pb-20 lg:rounded-3xl lg:px-8">
				<div className="absolute top-0 right-0 h-48 w-48 translate-x-1/4 -translate-y-1/2 rounded-full bg-white/5" />
				<div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-1/4 translate-y-1/2 rounded-full bg-white/5" />

				<div className="relative z-10">
					<h1 className="font-bold text-2xl text-white">Ajustes</h1>
					<p className="mt-1 text-white/70">Gerencie suas preferências</p>
				</div>
			</div>

			{/* Content */}
			<div className="-mt-12 space-y-6 px-4 pb-8">
				{/* User Card - Authenticated */}
				{user && (
					<div className="card animate-fade-in p-4">
						<div className="flex items-center gap-4">
							<div className="gradient-primary-vibrant flex h-16 w-16 items-center justify-center rounded-2xl">
								<span className="font-bold text-2xl text-white">
									{(user.name || user.email)[0].toUpperCase()}
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-bold text-foreground text-lg">{user.name || "Usuário"}</p>
								<p className="truncate text-foreground-secondary text-sm">{user.email}</p>
							</div>
							<button className="icon-box-sm bg-primary-500/10 text-primary-500 transition-colors hover:bg-primary-500/20">
								<HiChevronRight className="h-5 w-5" />
							</button>
						</div>
					</div>
				)}

				{/* Modo convidado Card */}
				{isGuestMode && !user && (
					<div className="card animate-fade-in p-4">
						<div className="mb-4 flex items-center gap-4">
							<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground-tertiary/20">
								<HiDevicePhoneMobile className="h-8 w-8 text-foreground-secondary" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="font-bold text-foreground text-lg">Modo convidado</p>
								<p className="text-foreground-secondary text-sm">Dados salvos neste dispositivo</p>
							</div>
						</div>
						<button
							className="btn-primary flex w-full items-center justify-center gap-2"
							onClick={handleUpgradeToAccount}
							type="button"
						>
							<HiCloudArrowUp className="h-5 w-5" />
							<span>Crie uma conta para sincronizar</span>
						</button>
						<p className="mt-2 text-center text-foreground-tertiary text-xs">
							Your local data will be synced to your new account
						</p>
					</div>
				)}

				{/* Sync Button - Only for authenticated users */}
				{isAuthenticated && user && (
					<div className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
						<button
							className="card flex w-full items-center justify-center gap-3 p-4 text-primary-500 transition-colors hover:bg-primary-500/5 disabled:opacity-50"
							disabled={isSyncing}
							onClick={handleSync}
							type="button"
						>
							<HiArrowPath className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
							<span className="font-semibold">{isSyncing ? "Sincronizando…" : "Sincronizar dados"}</span>
						</button>
					</div>
				)}

				{/* Aparência / Theme */}
				<div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
					<p className="section-header">Aparência</p>
					<div className="card p-4">
						<div className="mb-4 flex items-center gap-4">
							<div className="icon-box-sm bg-primary-500/10 text-primary-500">
								{resolvedTheme === "dark" ? <HiMoon className="h-5 w-5" /> : <HiSun className="h-5 w-5" />}
							</div>
							<div className="flex-1">
								<p className="font-semibold text-foreground">Tema</p>
								<p className="text-foreground-secondary text-sm">Currently using {resolvedTheme} theme</p>
							</div>
						</div>

						<div className="space-y-2">
							{themeOptions.map(option => (
								<button
									className={`flex w-full items-center gap-4 rounded-xl p-3 transition-all ${
										mode === option.id
											? "bg-primary-500 text-white"
											: "bg-background-card text-foreground hover:bg-primary-500/10"
									}`}
									key={option.id}
									onClick={() => setMode(option.id)}
								>
									<option.icon className="h-5 w-5" />
									<div className="flex-1 text-left">
										<p className="font-medium">{option.label}</p>
										<p
											className={`text-xs ${mode === option.id ? "text-white/70" : "text-foreground-secondary"}`}
										>
											{option.description}
										</p>
									</div>
									{mode === option.id && <HiCheck className="h-5 w-5 animate-scale-in" />}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* Notificações */}
				<div className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
					<p className="section-header">Notificações</p>
					<div className="card p-4">
						<div className="flex items-center gap-4">
							<div className="icon-box-sm bg-primary-500/10 text-primary-500">
								<HiBell className="h-5 w-5" />
							</div>
							<div className="flex-1">
								<p className="font-semibold text-foreground">Notificações push</p>
								<p className="text-foreground-secondary text-sm">Receba alertas e lembretes</p>
							</div>
							<button
								className="toggle"
								data-checked={notifications}
								onClick={() => setNotificações(!notifications)}
							>
								<span className="toggle-thumb" />
							</button>
						</div>
					</div>
				</div>

				{/* Ajustes Groups */}
				{settingsGroups.map((group, groupIdx) => (
					<div
						className="animate-fade-in"
						key={group.title}
						style={{ animationDelay: `${(groupIdx + 2) * 0.1}s` }}
					>
						<p className="section-header">{group.title}</p>
						<div className="card overflow-hidden">
							{group.items.map((item, idx) => (
								<button
									className={`list-item w-full ${
										idx < group.items.length - 1 ? "border-border-light border-b" : ""
									}`}
									key={item.label}
									onClick={item.action}
									type="button"
								>
									<div className="icon-box-sm bg-primary-500/10 text-primary-500">
										<item.icon className="h-5 w-5" />
									</div>
									<div className="flex-1 text-left">
										<p className="font-semibold text-foreground">{item.label}</p>
										<p className="text-foreground-secondary text-sm">{item.description}</p>
									</div>
									<HiChevronRight className="h-5 w-5 text-foreground-tertiary" />
								</button>
							))}
						</div>
					</div>
				))}

				{/* Logout Button */}
				{(isAuthenticated || isGuestMode) && (
					<button
						className="card flex w-full animate-fade-in items-center justify-center gap-3 p-4 text-danger transition-colors hover:bg-danger/5"
						onClick={handleLogout}
						style={{ animationDelay: "0.4s" }}
						type="button"
					>
						<HiArrowRightOnRectangle className="h-5 w-5" />
						<span className="font-semibold">{isGuestMode ? "Sair do modo convidado" : "Sair"}</span>
					</button>
				)}

				{/* Version */}
				<p
					className="animate-fade-in text-center text-foreground-tertiary text-sm"
					style={{ animationDelay: "0.5s" }}
				>
					Zaimu v1.0.0
				</p>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/settings/")({
	component: AjustesPage,
});
