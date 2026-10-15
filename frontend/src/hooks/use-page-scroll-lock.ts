import { useLayoutEffect } from "react";

let activeLocks = 0;
let previousOverflow = "";
let previousPriority = "";
let previousGutter = "";
let previousGutterPriority = "";
let scrollX = 0;
let scrollY = 0;

export function usePageScrollLock() {
	useLayoutEffect(() => {
		const root = document.documentElement;
		if (activeLocks === 0) {
			previousOverflow = root.style.getPropertyValue("overflow");
			previousPriority = root.style.getPropertyPriority("overflow");
			previousGutter = root.style.getPropertyValue("scrollbar-gutter");
			previousGutterPriority = root.style.getPropertyPriority("scrollbar-gutter");
			scrollX = window.scrollX;
			scrollY = window.scrollY;
			// Select popovers manage body overflow independently. Keep the page locked
			// at its root until every dialog closes, without changing its scroll position.
			// Keep the layout width stable when a classic scrollbar disappears.
			if (window.innerWidth > root.clientWidth) {
				root.style.setProperty("scrollbar-gutter", "stable", "important");
			}
			root.style.setProperty("overflow", "hidden", "important");
			window.scrollTo({ behavior: "instant", left: scrollX, top: scrollY });
		}
		activeLocks += 1;

		return () => {
			activeLocks -= 1;
			if (activeLocks > 0) return;
			if (previousOverflow) {
				root.style.setProperty("overflow", previousOverflow, previousPriority);
			} else {
				root.style.removeProperty("overflow");
			}
			if (previousGutter) {
				root.style.setProperty("scrollbar-gutter", previousGutter, previousGutterPriority);
			} else {
				root.style.removeProperty("scrollbar-gutter");
			}
			window.scrollTo({ behavior: "instant", left: scrollX, top: scrollY });
		};
	}, []);
}
