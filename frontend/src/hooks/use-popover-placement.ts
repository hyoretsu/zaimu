import { useLayoutEffect, useState } from "react";

/** Choose a vertical side from the visible area, including the on-screen keyboard. */
export function usePopoverPlacement(preferredSide: "top" | "right" | "bottom" | "left", sideOffset: number) {
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	const [side, setSide] = useState(preferredSide);

	useLayoutEffect(() => {
		if (!element || (preferredSide !== "top" && preferredSide !== "bottom")) return;
		const trigger = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(element.id)}"]`);
		if (!trigger) return;
		const viewport = window.visualViewport;
		let frame = 0;
		const update = () => {
			const top = (viewport?.offsetTop ?? 0) + 16;
			const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16;
			const rect = trigger.getBoundingClientRect();
			const above = Math.max(0, Math.min(bottom, rect.top) - top);
			const below = Math.max(0, bottom - Math.max(top, rect.bottom));
			const available = Math.max(above, below) - sideOffset;
			element.style.setProperty("--popover-side-height", `${Math.max(1, available)}px`);
			setSide(above > below ? "top" : below > above ? "bottom" : preferredSide);
		};
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		};
		const observer = new ResizeObserver(schedule);
		observer.observe(trigger);
		window.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);
		viewport?.addEventListener("resize", schedule);
		viewport?.addEventListener("scroll", schedule);
		update();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
			viewport?.removeEventListener("resize", schedule);
			viewport?.removeEventListener("scroll", schedule);
		};
	}, [element, preferredSide, sideOffset]);

	return { ref: setElement, side };
}
