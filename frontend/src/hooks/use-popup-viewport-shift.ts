import { useCallback, useLayoutEffect, useState } from "react";

/** Use the whole visual viewport before introducing overflow on an unconstrained popup. */
export function usePopupViewportShift(enabled = true, itemAligned = false) {
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);

	useLayoutEffect(() => {
		if (!element || !enabled) return;
		const viewport = window.visualViewport;
		let frame = 0;
		const update = () => {
			const top = (viewport?.offsetTop ?? 0) + 16;
			const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16;
			const height = Math.max(0, bottom - top);
			element.style.setProperty("--popup-viewport-height", `${height}px`);
			if (itemAligned && element.parentElement) {
				const wrapper = element.parentElement;
				const list = element.querySelector<HTMLElement>("[data-radix-select-viewport]");
				if (list) {
					wrapper.style.height = `${Math.min(list.scrollHeight, height)}px`;
					wrapper.style.minHeight = "0px";
					if (list.scrollHeight <= height) list.scrollTop = 0;
				}
			}
			// Measure the positioning wrapper, which is unaffected by our child translation.
			const originalTop =
				element.parentElement?.getBoundingClientRect().top ?? element.getBoundingClientRect().top;
			const shift = Math.max(top, Math.min(originalTop, bottom - element.offsetHeight)) - originalTop;
			element.style.translate = `0 ${shift}px`;
		};
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		};
		const observer = new ResizeObserver(schedule);
		observer.observe(element);
		if (element.parentElement) observer.observe(element.parentElement);
		// Floating positioning and entrance animations can move the popup without resizing it.
		const positionObserver = new MutationObserver(schedule);
		if (element.parentElement && !itemAligned)
			positionObserver.observe(element.parentElement, { attributeFilter: ["style"], attributes: true });
		element.addEventListener("animationend", schedule);
		window.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);
		viewport?.addEventListener("resize", schedule);
		viewport?.addEventListener("scroll", schedule);
		update();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			positionObserver.disconnect();
			element.removeEventListener("animationend", schedule);
			window.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
			viewport?.removeEventListener("resize", schedule);
			viewport?.removeEventListener("scroll", schedule);
			element.style.translate = "";
		};
	}, [element, enabled, itemAligned]);

	return ref;
}
