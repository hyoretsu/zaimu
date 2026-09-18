import { createFileRoute, Link } from "@tanstack/react-router";
import {
	HiCalendarDays,
	HiChevronRight,
	HiClipboardDocumentList,
	HiCog6Tooth,
	HiUsers,
} from "react-icons/hi2";
import { mobileNavigation, primaryNavigation, utilityNavigation } from "@/components/layout/navigation";

const desktopNavigationPaths = new Set([...primaryNavigation, ...utilityNavigation].map(item => item.to));
const mobileNavigationPaths = new Set(mobileNavigation.map(item => item.to));

const menuItems = [
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
];

function renderMenuItems(items: typeof menuItems) {
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
	return (
		<div className="mx-auto min-h-screen w-full max-w-5xl bg-background lg:py-10">
			{/* Header */}
			<div className="gradient-primary relative overflow-hidden px-4 pt-12 pb-20 lg:rounded-3xl lg:px-8">
				<div className="absolute top-0 right-0 h-48 w-48 translate-x-1/4 -translate-y-1/2 rounded-full bg-primary-500/20" />
				<div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-1/4 translate-y-1/2 rounded-full bg-primary-500/10" />

				<div className="relative z-10">
					<h1 className="font-bold text-2xl text-white">Mais</h1>
					<p className="mt-1 text-white/70">Explore todos os recursos</p>
				</div>
			</div>

			{/* Menu List */}
			<div className="-mt-12 px-4 pb-8">
				<div className="card animate-fade-in overflow-hidden">
					<div className="lg:hidden">{renderMenuItems(mobileMenuItems)}</div>
					<div className="hidden lg:block">{renderMenuItems(desktopMenuItems)}</div>
				</div>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/more")({
	component: MorePage,
});
