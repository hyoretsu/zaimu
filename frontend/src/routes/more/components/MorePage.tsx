import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	HiCalendarDays,
	HiChevronRight,
	HiClipboardDocumentList,
	HiCog6Tooth,
	HiUsers,
} from "react-icons/hi2";
import { mobileNavigation, primaryNavigation, utilityNavigation } from "@/components/layout/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";

const desktopNavigationPaths = new Set<string>(
	[...primaryNavigation, ...utilityNavigation].map(item => item.to),
);
const mobileNavigationPaths = new Set<string>(mobileNavigation.map(item => item.to));

const menuItems = [
	{
		color: "bg-primary/10 text-primary",
		description: "Planeje despesas por tag e faturas de todos os cartões",
		icon: HiCalendarDays,
		label: "Orçamento mensal",
		to: "/budget",
	},
	{
		color: "bg-primary/10 text-primary",
		description: "Gerencie impostos, usuários e dados financeiros",
		icon: HiClipboardDocumentList,
		label: "Administração",
		to: "/admin",
	},
	{
		color: "bg-danger/10 text-danger",
		description: "Acompanhe dívidas pessoais",
		icon: HiUsers,
		label: "Dívidas",
		to: "/debts",
	},
	{
		color: "bg-warning/10 text-warning",
		description: "Gerencie empréstimos e financiamentos",
		icon: HiClipboardDocumentList,
		label: "Empréstimos",
		to: "/loans",
	},
	{
		color: "bg-warning/10 text-warning",
		description: "Centralize salários, assinaturas e pagamentos",
		icon: HiCalendarDays,
		label: "Recorrências",
		to: "/recurring",
	},
	{
		color: "bg-primary-500/10 text-primary-500",
		description: "Preferências do aplicativo",
		icon: HiCog6Tooth,
		label: "Ajustes",
		to: "/settings",
	},
] as const;

function renderMenuItems(items: readonly (typeof menuItems)[number][]) {
	return items.map((item, idx) => (
		<Link className="block" key={item.to} to={item.to}>
			<div
				className={`flex items-center gap-4 p-4 transition-colors hover:bg-background-card/50 active:bg-background-card ${
					idx < items.length - 1 ? "border-border-light border-b" : ""
				}`}
				style={{ animationDelay: `${idx * 0.05}s` }}
			>
				<div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.color}`}>
					<item.icon className="h-6 w-6" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-foreground">{item.label}</p>
					<p className="truncate text-foreground-muted text-sm">{item.description}</p>
				</div>
				<HiChevronRight className="h-5 w-5 text-foreground-muted" />
			</div>
		</Link>
	));
}

const desktopMenuItems = menuItems.filter(item => !desktopNavigationPaths.has(item.to));
const mobileMenuItems = menuItems.filter(item => !mobileNavigationPaths.has(item.to));

export function MorePage() {
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const userId = useAuthStore(state => state.user?.id);
	const access = useQuery({
		enabled: authenticated,
		queryFn: () => fetchWithAuth<{ role: string }>("/admin/access"),
		queryKey: ["admin-access", userId],
		retry: false,
	});
	const visibleDesktopMenuItems = desktopMenuItems.filter(
		item => item.to !== "/admin" || access.data?.role === "ADMIN",
	);
	const visibleMobileMenuItems = mobileMenuItems.filter(
		item => item.to !== "/admin" || access.data?.role === "ADMIN",
	);
	return (
		<div className="mx-auto min-h-screen w-full max-w-5xl bg-background lg:py-10">
			<PageHeader className="px-4 pt-6 pb-8 lg:px-8" description="Explore todos os recursos" title="Mais" />

			{/* Menu List */}
			<div className="px-4 pb-8">
				<div className="card animate-fade-in overflow-hidden">
					<div className="lg:hidden">{renderMenuItems(visibleMobileMenuItems)}</div>
					<div className="hidden lg:block">{renderMenuItems(visibleDesktopMenuItems)}</div>
				</div>
			</div>
		</div>
	);
}
