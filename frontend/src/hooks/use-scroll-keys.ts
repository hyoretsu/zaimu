import { useEffect } from "react";
import {
	findScroller,
	findScrollerWithin,
	ownsScrollKey,
	resolveScrollKey,
	scrollByCommand,
	topmostDialog,
	wheelDistance,
} from "@/lib/scroll-keys";

const isRoot = (node: Element | null) => !node || node === document.body || node === document.documentElement;

// Makes scroll keys (Home/End, PageUp/PageDown, Space, arrows) and Shift+wheel act on the
// scroll region the user is working in. The browser defaults to the page behind an open
// modal; here the topmost modal owns scrolling and the page stays still.
export function useScrollKeys() {
	useEffect(() => {
		let pointerTarget: Element | null = null;

		const onPointerDown = (event: PointerEvent) => {
			pointerTarget = event.target instanceof Element ? event.target : null;
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing) return;
			const command = resolveScrollKey(event);
			const target = event.target instanceof Element ? event.target : null;
			if (!command || ownsScrollKey(target, command)) return;

			const dialog = topmostDialog();
			let origin = isRoot(target) && pointerTarget?.isConnected ? pointerTarget : target;
			if (isRoot(origin)) origin = null;
			if (dialog && !(origin && dialog.contains(origin))) origin = dialog;
			if (!origin) return;

			const scroller =
				findScroller(origin, dialog, command.axis, command.edge ? undefined : command.direction) ??
				(dialog
					? findScrollerWithin(dialog, command.axis, command.edge ? undefined : command.direction)
					: null);
			// With a modal open the page behind must never scroll, even when the modal cannot.
			if (scroller || dialog) event.preventDefault();
			if (scroller) scrollByCommand(scroller, command);
		};

		const onWheel = (event: WheelEvent) => {
			if (!event.shiftKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
			const delta = event.deltaX || event.deltaY;
			if (!delta || !(event.target instanceof Element)) return;
			const dialog = topmostDialog();
			if (dialog && !dialog.contains(event.target)) return;
			const scroller = findScroller(event.target, dialog, "x", delta < 0 ? -1 : 1);
			if (!scroller) return;
			event.preventDefault();
			scroller.scrollBy({ behavior: "instant", left: wheelDistance(event, scroller) });
		};

		document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("wheel", onWheel, { capture: true, passive: false });
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, { capture: true });
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("wheel", onWheel, { capture: true });
		};
	}, []);
}
