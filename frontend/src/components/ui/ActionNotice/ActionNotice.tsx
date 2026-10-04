import { ActionGroup } from "@/components/ui/ActionGroup";
import { cn } from "@/lib/utils";
import type { ActionNoticeProps } from "./types";

const toneClasses = {
	primary: "border-primary/40 bg-primary/10",
	warning: "border-amber-500/40 bg-amber-500/10",
};

export function ActionNotice({
	action,
	children,
	description,
	icon,
	title,
	tone = "primary",
}: ActionNoticeProps) {
	return (
		<section className={cn("rounded-2xl border p-4", toneClasses[tone])}>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					{icon}
					<div className="min-w-0">
						<p className="font-semibold">{title}</p>
						<p className="text-muted-foreground text-sm">{description}</p>
					</div>
				</div>
				<ActionGroup className="ml-auto">{action}</ActionGroup>
			</div>
			{children && <div className="mt-3 space-y-2">{children}</div>}
		</section>
	);
}
