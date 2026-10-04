import type { ReactNode } from "react";
import { ActionGroup } from "./ActionGroup";

export function EmptyState({
	action,
	description,
	icon,
	title,
}: {
	action?: ReactNode;
	description: string;
	icon: ReactNode;
	title: string;
}) {
	return (
		<div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-8 text-center">
			<div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
				{icon}
			</div>
			<h2 className="font-bold text-lg">{title}</h2>
			<p className="mt-1 max-w-sm text-muted-foreground text-sm">{description}</p>
			{action && <ActionGroup className="mt-5 w-full">{action}</ActionGroup>}
		</div>
	);
}
