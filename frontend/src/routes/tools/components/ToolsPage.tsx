import { Link } from "@tanstack/react-router";
import { HiChevronRight, HiScale } from "react-icons/hi2";
import { ToolPageFrame } from "@/components/layout/ToolPageFrame";
import { PageHeader } from "@/components/ui/PageHeader";
import { useDocumentTitle } from "@/hooks/use-document-title";

const tools = [
	{
		color: "bg-primary/10 text-primary",
		description: "Compare taxas, prazos, CET e Pix no crédito lado a lado.",
		icon: HiScale,
		label: "Comparar empréstimos",
		to: "/tools/loan-comparison",
	},
] as const;

export function ToolsPage() {
	useDocumentTitle("Ferramentas");
	return (
		<ToolPageFrame>
			<PageHeader
				description="Calculadoras e simuladores para decidir com clareza."
				title="Ferramentas"
			/>
			<div className="card animate-fade-in overflow-hidden">
				{tools.map((tool, idx) => (
					<Link className="block" key={tool.to} to={tool.to}>
						<div
							className={`hover:bg-background-card/50 active:bg-background-card flex items-center gap-4 p-4 transition-colors ${
								idx < tools.length - 1 ? "border-border-light border-b" : ""
							}`}
						>
							<div
								className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tool.color}`}
							>
								<tool.icon className="h-6 w-6" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-foreground font-semibold">{tool.label}</p>
								<p className="text-foreground-muted text-sm">{tool.description}</p>
							</div>
							<HiChevronRight className="text-foreground-muted h-5 w-5" />
						</div>
					</Link>
				))}
			</div>
		</ToolPageFrame>
	);
}
