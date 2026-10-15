import type { ReactNode } from "react";

export function CoverageSourceGroup({
	title,
	count,
	collapsible,
	children,
}: {
	title: string;
	count: number;
	collapsible: boolean;
	children: ReactNode;
}) {
	if (!collapsible) return children;
	return (
		<details className="group min-w-0 rounded-xl border p-4">
			<summary className="cursor-pointer font-semibold">
				{title}
				<span className="ml-2 font-normal text-muted-foreground text-sm">
					{count} {count === 1 ? "registro" : "registros"} -{" "}
					<span className="group-open:hidden">Expandir</span>
					<span className="hidden group-open:inline">Minimizar</span>
				</span>
			</summary>
			<div className="mt-4 grid min-w-0 gap-3">{children}</div>
		</details>
	);
}
