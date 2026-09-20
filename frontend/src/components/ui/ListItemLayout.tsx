import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ListItemLayout({
	actions,
	amount,
	children,
	className,
	icon,
	metadata,
	tags,
	title,
}: {
	actions?: ReactNode;
	amount: ReactNode;
	children?: ReactNode;
	className?: string;
	icon: ReactNode;
	metadata?: ReactNode;
	tags?: ReactNode;
	title: ReactNode;
}) {
	return (
		<div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-4 px-4 py-5", className)}>
			{icon}
			<div className="min-w-0 space-y-3">
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
					<div className="min-w-0">{title}</div>
					<div className="shrink-0">{amount}</div>
				</div>
				{metadata}
				{tags}
				{children}
				{actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
			</div>
		</div>
	);
}
