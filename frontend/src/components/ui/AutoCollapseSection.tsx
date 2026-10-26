import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { Button } from "./Button";

/** Collapse completed fields only after focus leaves, keeping debounced inputs mounted. */
export function AutoCollapseSection({
	children,
	collapseOnBlurOnly = false,
	complete,
	summary,
	title,
}: {
	children: ReactNode;
	collapseOnBlurOnly?: boolean;
	complete: boolean;
	summary: ReactNode;
	title: string;
}) {
	const [expanded, setExpanded] = useState(collapseOnBlurOnly || !complete);
	const completeRef = useRef(complete);
	completeRef.current = complete;
	const root = useRef<HTMLDivElement>(null);
	const contentId = useId();
	const collapseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pointerDown = useRef(false);
	const scheduleCollapse = useCallback(() => {
		clearTimeout(collapseTimer.current);
		const collapse = () => {
			if (!completeRef.current) return;
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
	}, []);
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
		if (!collapseOnBlurOnly) scheduleCollapse();
	}, [collapseOnBlurOnly, complete, scheduleCollapse]);
	useEffect(() => () => clearTimeout(collapseTimer.current), []);
	return (
		<div className="grid min-w-0 gap-3 rounded-xl border p-3" onBlur={scheduleCollapse} ref={root}>
			<div className="relative -m-3 flex min-w-0 items-center gap-2 p-3">
				<div className="min-w-0 flex-1 text-sm break-words">
					<span className="font-medium">{title}</span>
					{!expanded ? <span className="text-muted-foreground"> - {summary}</span> : null}
				</div>
				<Button
					aria-controls={contentId}
					aria-expanded={expanded}
					aria-label={expanded ? "Minimizar" : "Expandir"}
					className="static shrink-0 cursor-pointer after:absolute after:inset-0 after:rounded-xl after:content-[''] active:not-aria-[haspopup]:translate-none"
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
