import { useNavigate } from "@tanstack/react-router";
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
import { ActionGroup } from "@/components/ui/ActionGroup";
import { PageHeader } from "@/components/ui/PageHeader";
import { dataService } from "@/lib/dataService";
import { showToast, type ThemeMode, useAuthStore, useThemeStore } from "@/stores";
import { CountrySettings } from "./CountrySettings";
import { CurrencySettings } from "./CurrencySettings";
import { FinancialCoverageDialog } from "./FinancialCoverageDialog";
import { InstitutionNotifications } from "./InstitutionNotifications";
import { InvoicePaymentSettings } from "./InvoicePaymentSettings";
import { TimeZoneSettings } from "./TimeZoneSettings";

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
		await logout();
		const state = useAuthStore.getState();
		if (state.isAuthenticated) {
			showToast(state.error ?? "Não foi possível sair.", "negative");
			return;
		}
		await dataService.sync.clearLocalData();
		void navigate({ to: "/auth" });
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
		<div className="bg-background mx-auto min-h-screen w-full max-w-5xl lg:py-10">
			<PageHeader
				backTo="/more"
				className="px-4 pt-6 pb-8 lg:px-8"
				description="Gerencie suas preferências"
				title="Ajustes"
			/>

			{/* Content */}
			<div className="space-y-6 px-4 pb-8">
				{/* User Card - Authenticated */}
				{user && (
					<div className="card animate-fade-in p-4">
						<div className="flex items-center gap-4">
							<div className="gradient-primary-vibrant flex h-16 w-16 items-center justify-center rounded-2xl">
								<span className="text-2xl font-bold text-white">
									{(user.name || user.email)[0].toUpperCase()}
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-foreground truncate text-lg font-bold">
									{user.name || "Usuário"}
								</p>
								<p className="text-foreground-secondary truncate text-sm">{user.email}</p>
							</div>
							<button className="icon-box-sm bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition-colors">
								<HiChevronRight className="h-5 w-5" />
							</button>
						</div>
					</div>
				)}

				{/* Modo convidado Card */}
				{isGuestMode && !user && (
					<div className="card animate-fade-in p-4">
						<div className="mb-4 flex items-center gap-4">
							<div className="bg-foreground-tertiary/20 flex h-16 w-16 items-center justify-center rounded-2xl">
								<HiDevicePhoneMobile className="text-foreground-secondary h-8 w-8" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-foreground text-lg font-bold">Modo convidado</p>
								<p className="text-foreground-secondary text-sm">
									Dados salvos neste dispositivo
								</p>
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
						<p className="text-foreground-tertiary mt-2 text-center text-xs">
							Your local data will be synced to your new account
						</p>
					</div>
				)}

				{/* Sync Button - Only for authenticated users */}
				{isAuthenticated && user && (
					<div className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
						<button
							className="card text-primary-500 hover:bg-primary-500/5 flex w-full items-center justify-center gap-3 p-4 transition-colors disabled:opacity-50"
							disabled={isSyncing}
							onClick={handleSync}
							type="button"
						>
							<HiArrowPath className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
							<span className="font-semibold">
								{isSyncing ? "Sincronizando…" : "Sincronizar dados"}
							</span>
						</button>
					</div>
				)}

				<CurrencySettings />
				<CountrySettings />
				<TimeZoneSettings />
				<InvoicePaymentSettings />
				<InstitutionNotifications />
				{!isGuestMode && (
					<ActionGroup>
						<FinancialCoverageDialog />
					</ActionGroup>
				)}
				{/* Aparência / Theme */}
				<div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
					<p className="section-header">Aparência</p>
					<div className="card p-4">
						<div className="mb-4 flex items-center gap-4">
							<div className="icon-box-sm bg-primary-500/10 text-primary-500">
								{resolvedTheme === "dark" ? (
									<HiMoon className="h-5 w-5" />
								) : (
									<HiSun className="h-5 w-5" />
								)}
							</div>
							<div className="flex-1">
								<p className="text-foreground font-semibold">Tema</p>
								<p className="text-foreground-secondary text-sm">
									Currently using {resolvedTheme} theme
								</p>
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
									{mode === option.id && <HiCheck className="animate-scale-in h-5 w-5" />}
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
								<p className="text-foreground font-semibold">Notificações push</p>
								<p className="text-foreground-secondary text-sm">
									Receba alertas e lembretes
								</p>
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
										<p className="text-foreground font-semibold">{item.label}</p>
										<p className="text-foreground-secondary text-sm">
											{item.description}
										</p>
									</div>
									<HiChevronRight className="text-foreground-tertiary h-5 w-5" />
								</button>
							))}
						</div>
					</div>
				))}

				{/* Logout Button */}
				{(isAuthenticated || isGuestMode) && (
					<button
						className="card animate-fade-in text-danger hover:bg-danger/5 flex w-full items-center justify-center gap-3 p-4 transition-colors"
						onClick={handleLogout}
						style={{ animationDelay: "0.4s" }}
						type="button"
					>
						<HiArrowRightOnRectangle className="h-5 w-5" />
						<span className="font-semibold">
							{isGuestMode ? "Sair do modo convidado" : "Sair"}
						</span>
					</button>
				)}

				{/* Version */}
				<p
					className="animate-fade-in text-foreground-tertiary text-center text-sm"
					style={{ animationDelay: "0.5s" }}
				>
					Zaimu v1.0.0
				</p>
			</div>
		</div>
	);
}
