import { type ReactNode, useId, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { Button } from "./Button";
import { ScrollArea } from "./ScrollArea";

export function CollapsibleListingSection({
	children,
	description,
	summary,
	title,
	toolbar,
}: {
	children: ReactNode;
	description: string;
	summary: ReactNode;
	title: string;
	toolbar?: ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);
	const contentId = useId();
	return (
		<section className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:p-6">
			<div className="flex min-w-0 items-start gap-3">
				<div className="min-w-0 flex-1 space-y-1">
					<h2 className="font-semibold text-lg">{title}</h2>
					<p className="text-muted-foreground text-sm">{description}</p>
					<p aria-live="polite" className="text-muted-foreground text-sm">
						{summary}
					</p>
				</div>
				<Button
					aria-controls={contentId}
					aria-expanded={expanded}
					aria-label={expanded ? "Minimizar" : "Expandir"}
					className="shrink-0 cursor-pointer"
					onClick={() => setExpanded(value => !value)}
					size="icon"
					type="button"
					variant="outline"
				>
					{expanded ? <LuChevronUp /> : <LuChevronDown />}
				</Button>
			</div>
			<div hidden={!expanded} id={contentId}>
				<div className="grid min-h-0 min-w-0 gap-4">
					{toolbar}
					<ScrollArea className="h-[min(24rem,50dvh)] min-h-0 min-w-0" type="always">
						<div className="space-y-3 pr-3">{children}</div>
					</ScrollArea>
				</div>
			</div>
		</section>
	);
}
