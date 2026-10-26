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
	description?: string;
	summary?: ReactNode;
	title: string;
	toolbar?: ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);
	const contentId = useId();
	return (
		<section className="bg-card relative grid min-w-0 gap-4 rounded-2xl border p-4 sm:p-6">
			<div
				className={`-m-4 flex min-w-0 items-start gap-3 p-4 sm:-m-6 sm:p-6 ${expanded ? "relative" : ""}`}
			>
				<div className="min-w-0 flex-1 space-y-1">
					<h2 className="text-lg font-semibold">{title}</h2>
					{description && <p className="text-muted-foreground text-sm">{description}</p>}
					{summary != null && (
						<p aria-live="polite" className="text-muted-foreground text-sm">
							{summary}
						</p>
					)}
				</div>
				<Button
					aria-controls={contentId}
					aria-expanded={expanded}
					aria-label={expanded ? "Minimizar" : "Expandir"}
					className={
						expanded
							? "static shrink-0 cursor-pointer after:absolute after:inset-x-0 after:top-0 after:h-full after:rounded-2xl after:content-[''] active:not-aria-[haspopup]:translate-none"
							: "static shrink-0 cursor-pointer after:absolute after:inset-0 after:rounded-2xl after:content-[''] active:not-aria-[haspopup]:translate-none"
					}
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
