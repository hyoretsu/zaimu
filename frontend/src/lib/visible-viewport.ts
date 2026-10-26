/** Keep fixed surfaces inside the area actually visible above the software keyboard. */
export function initializeVisibleViewport() {
	const viewport = window.visualViewport;
	const root = document.documentElement;
	let frame = 0;
	const update = () => {
		const top = viewport?.offsetTop ?? 0;
		const height = viewport?.height ?? window.innerHeight;
		root.style.setProperty("--visible-viewport-height", `${height}px`);
		root.style.setProperty("--visible-viewport-center", `${top + height / 2}px`);
		// Scroll only the owning content region; never move background pages or dialogs.
		const active = document.activeElement;
		if (!(active instanceof HTMLElement) || !active.matches("input, textarea, [contenteditable=true]"))
			return;
		const scroll = active.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
		if (!scroll) return;
		const rect = active.getBoundingClientRect();
		const bounds = scroll.getBoundingClientRect();
		const bottom = Math.min(bounds.bottom, top + height) - 12;
		const start = Math.max(bounds.top, top) + 12;
		if (rect.bottom > bottom) scroll.scrollTop += rect.bottom - bottom;
		else if (rect.top < start) scroll.scrollTop -= start - rect.top;
	};
	const schedule = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(update);
	};
	viewport?.addEventListener("resize", schedule);
	viewport?.addEventListener("scroll", schedule);
	window.addEventListener("resize", schedule);
	document.addEventListener("focusin", schedule);
	update();
	return () => {
		cancelAnimationFrame(frame);
		viewport?.removeEventListener("resize", schedule);
		viewport?.removeEventListener("scroll", schedule);
		window.removeEventListener("resize", schedule);
		document.removeEventListener("focusin", schedule);
		root.style.removeProperty("--visible-viewport-height");
		root.style.removeProperty("--visible-viewport-center");
	};
}
