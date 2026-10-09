import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { Button } from "./Button";

/** Collapse completed fields only after focus leaves, keeping debounced inputs mounted. */
export function AutoCollapseSection({
	children,
	complete,
	summary,
	title,
}: {
	children: ReactNode;
	complete: boolean;
	summary: ReactNode;
	title: string;
}) {
	const [expanded, setExpanded] = useState(!complete);
	const root = useRef<HTMLDivElement>(null);
	const contentId = useId();
	const collapseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pointerDown = useRef(false);
	const scheduleCollapse = useCallback(() => {
		clearTimeout(collapseTimer.current);
		if (!complete) return;
		const collapse = () => {
			// Blur occurs before click. Keep geometry stable through the whole pointer gesture.
			if (pointerDown.current) {
				collapseTimer.current = setTimeout(collapse, 400);
				return;
			}
			const active = document.activeElement;
			if (
				!root.current?.contains(active) &&
				!active?.closest('[role="listbox"], [data-radix-popper-content-wrapper]')
			)
				setExpanded(false);
		};
		collapseTimer.current = setTimeout(collapse, 400);
	}, [complete]);
	useEffect(() => {
		const start = () => {
			pointerDown.current = true;
		};
		const end = () => {
			pointerDown.current = false;
		};
		document.addEventListener("pointerdown", start, true);
		document.addEventListener("pointerup", end, true);
		document.addEventListener("pointercancel", end, true);
		return () => {
			document.removeEventListener("pointerdown", start, true);
			document.removeEventListener("pointerup", end, true);
			document.removeEventListener("pointercancel", end, true);
		};
	}, []);
	useEffect(() => {
		if (!complete) setExpanded(true);
		scheduleCollapse();
		return () => clearTimeout(collapseTimer.current);
	}, [complete, scheduleCollapse]);
	return (
		<div className="grid min-w-0 gap-3 rounded-xl border p-3" onBlur={scheduleCollapse} ref={root}>
			<div className="flex min-w-0 items-center gap-2">
				<div className="min-w-0 flex-1 break-words text-sm">
					<span className="font-medium">{title}</span>
					{!expanded ? <span className="text-muted-foreground"> - {summary}</span> : null}
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
				<div className="grid min-w-0 gap-3">{children}</div>
			</div>
		</div>
	);
}
