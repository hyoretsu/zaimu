import type { LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageActions } from "./PageActions";
import { PageBackButton } from "./PageBackButton";
import type { PageAction } from "./page-action";

export function PageHeader({
	actions,
	controls,
	backTo,
	className,
	description,
	subtitle,
	title,
}: {
	actions?: PageAction[];
	controls?: ReactNode;
	backTo?: LinkProps["to"];
	className?: string;
	description?: string;
	subtitle?: string;
	title: string;
}) {
	return (
		<header className={cn("space-y-6", className)}>
			{backTo && <PageBackButton to={backTo} />}
			<div className="flex flex-wrap items-end justify-between gap-5">
				<div className="min-w-0 grow basis-full">
					{subtitle && (
						<p className="mb-1 font-bold text-primary text-xs uppercase tracking-[0.16em]">{subtitle}</p>
					)}
					<h1 className="break-words font-bold text-3xl tracking-tight sm:text-4xl">{title}</h1>
					{description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
				</div>
				{actions && <PageActions actions={actions} />}
				{controls}
			</div>
		</header>
	);
}
