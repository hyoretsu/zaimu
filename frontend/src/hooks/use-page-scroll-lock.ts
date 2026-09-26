import { useEffect } from "react";

let activeLocks = 0;
let previousOverflow = "";
let previousPriority = "";

export function usePageScrollLock() {
	useEffect(() => {
		const root = document.documentElement;
		if (activeLocks === 0) {
			previousOverflow = root.style.getPropertyValue("overflow");
			previousPriority = root.style.getPropertyPriority("overflow");
			// Select popovers manage body overflow independently. Keep the page locked
			// at its root until every dialog closes, without changing its scroll position.
			root.style.setProperty("overflow", "hidden", "important");
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
		};
	}, []);
}
