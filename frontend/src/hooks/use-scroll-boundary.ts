import { type Ref, useCallback } from "react";

// Cancel gestures that would escape this layer without changing page overflow,
// scrollbar visibility, layout, or the current scroll position.
export function useScrollBoundary<T extends HTMLElement>(ref?: Ref<T>) {
	return useCallback(
		(element: T | null) => {
			const releaseRef = typeof ref === "function" ? ref(element) : undefined;
			if (ref && typeof ref !== "function") ref.current = element;
			if (!element) return;

			const canScroll = (target: EventTarget | null, deltaX: number, deltaY: number) => {
				let node = target instanceof Element ? target : null;
				while (node && element.contains(node)) {
					if (node instanceof HTMLElement) {
						const style = getComputedStyle(node);
						const vertical = /auto|scroll/.test(style.overflowY);
						const horizontal = /auto|scroll/.test(style.overflowX);
						if (Math.abs(deltaY) >= Math.abs(deltaX)) {
							if (
								vertical &&
								(deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1)
							)
								return true;
						} else if (
							horizontal &&
							(deltaX < 0 ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1)
						)
							return true;
					}
					if (node === element) break;
					node = node.parentElement;
				}
				return false;
			};
			const onWheel = (event: WheelEvent) => {
				if (!event.ctrlKey && !canScroll(event.target, event.deltaX, event.deltaY)) event.preventDefault();
			};
			let touchX = 0;
			let touchY = 0;
			const onTouchStart = (event: TouchEvent) => {
				if (event.touches.length !== 1) return;
				touchX = event.touches[0].clientX;
				touchY = event.touches[0].clientY;
			};
			const onTouchMove = (event: TouchEvent) => {
				if (event.touches.length !== 1) return;
				const touch = event.touches[0];
				if (!canScroll(event.target, touchX - touch.clientX, touchY - touch.clientY)) event.preventDefault();
				touchX = touch.clientX;
				touchY = touch.clientY;
			};
			element.addEventListener("wheel", onWheel, { passive: false });
			element.addEventListener("touchstart", onTouchStart, { passive: true });
			element.addEventListener("touchmove", onTouchMove, { passive: false });
			return () => {
				element.removeEventListener("wheel", onWheel);
				element.removeEventListener("touchstart", onTouchStart);
				element.removeEventListener("touchmove", onTouchMove);
				if (typeof releaseRef === "function") releaseRef();
				else if (typeof ref === "function") ref(null);
				else if (ref) ref.current = null;
			};
		},
		[ref],
	);
}
