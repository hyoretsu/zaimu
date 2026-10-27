/** Preserve a visible record when navigation changes the content before it. */
export function captureScrollPosition(element: HTMLElement) {
	const viewport = element.getBoundingClientRect();
	const anchor = Array.from(element.querySelectorAll<HTMLElement>("[data-scroll-anchor]")).find(item => {
		const rect = item.getBoundingClientRect();
		return (
			rect.right > viewport.left &&
			rect.left < viewport.right &&
			rect.bottom > viewport.top &&
			rect.top < viewport.bottom
		);
	});
	return {
		anchor,
		anchorRect: anchor?.getBoundingClientRect(),
		element,
		left: element.scrollLeft,
		top: element.scrollTop,
		viewport,
	};
}

export function restoreScrollPosition(position: ReturnType<typeof captureScrollPosition>) {
	const { element, anchor, anchorRect } = position;
	if (!element.isConnected) return;
	if (anchor?.isConnected && anchorRect) {
		const rect = anchor.getBoundingClientRect();
		const viewport = element.getBoundingClientRect();
		element.scrollLeft += rect.left - viewport.left - (anchorRect.left - position.viewport.left);
		element.scrollTop += rect.top - viewport.top - (anchorRect.top - position.viewport.top);
	} else {
		element.scrollLeft = position.left;
		element.scrollTop = position.top;
	}
}
