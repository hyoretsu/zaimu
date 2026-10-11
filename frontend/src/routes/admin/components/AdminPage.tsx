import { Link } from "@tanstack/react-router";
import {
	LuCalendarDays,
	LuChartNoAxesCombined,
	LuChevronRight,
	LuReceiptText,
	LuUsers,
} from "react-icons/lu";
import { AdminPageLayout } from "./AdminPageLayout";

const sections = [
	{
		description: "Configure o calendário usado nos rendimentos das contas.",
		icon: LuCalendarDays,
		title: "Moedas, países e feriados",
		to: "/admin/yield-calendar",
	},
	{
		description: "Consulte a cobertura de juros e conversões cambiais.",
		icon: LuChartNoAxesCombined,
		title: "Histórico financeiro",
		to: "/admin/history",
	},
	{
		description: "Gerencie impostos, faixas e versões de tributação.",
		icon: LuReceiptText,
		title: "Impostos",
		to: "/admin/taxes",
	},
	{
		description: "Busque usuários e gerencie permissões administrativas.",
		icon: LuUsers,
		title: "Usuários",
		to: "/admin/users",
	},
] as const;

export function AdminPage() {
	return (
		<AdminPageLayout
			description="Gerencie os cadastros e dados globais do aplicativo."
			root
			title="Administração"
		>
			<nav aria-label="Seções administrativas" className="grid gap-4 sm:grid-cols-2">
				{sections.map(section => (
					<Link
						className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						key={section.to}
						to={section.to}
					>
						<span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<section.icon className="size-6" />
						</span>
						<div className="min-w-0 flex-1">
							<h2 className="font-semibold text-base">{section.title}</h2>
							<p className="mt-1 text-muted-foreground text-sm">{section.description}</p>
						</div>
						<LuChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" />
					</Link>
				))}
			</nav>
		</AdminPageLayout>
	);
}
