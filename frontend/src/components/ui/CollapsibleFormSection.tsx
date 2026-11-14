import { type ReactNode, useId, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { Button } from "./Button";

/** Form section that toggles from its whole header row; collapsed it shows the title and one summary line. */
export function CollapsibleFormSection({
	children,
	defaultExpanded = false,
	onExpandedChange,
	summary,
	title,
}: {
	children: ReactNode;
	defaultExpanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	summary: ReactNode;
	title: string;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const contentId = useId();
	return (
		<section className="relative grid min-w-0 gap-3 rounded-xl border p-3">
			<div className={`-m-3 flex min-w-0 items-center gap-2 p-3 ${expanded ? "relative" : ""}`}>
				<div className="min-w-0 flex-1 space-y-0.5">
					<h3 className="text-sm font-semibold">{title}</h3>
					{!expanded && (
						<p aria-live="polite" className="text-muted-foreground text-sm break-words">
							{summary}
						</p>
					)}
				</div>
				<Button
					aria-controls={contentId}
					aria-expanded={expanded}
					aria-label={expanded ? "Minimizar" : "Expandir"}
					className="static shrink-0 cursor-pointer after:absolute after:inset-0 after:rounded-xl after:content-[''] active:not-aria-[haspopup]:translate-none"
					onClick={() => {
						setExpanded(!expanded);
						onExpandedChange?.(!expanded);
					}}
					size="icon-sm"
					type="button"
					variant="outline"
				>
					{expanded ? <LuChevronUp /> : <LuChevronDown />}
				</Button>
			</div>
			<div className="grid min-w-0 gap-4" hidden={!expanded} id={contentId}>
				{children}
			</div>
		</section>
	);
}
