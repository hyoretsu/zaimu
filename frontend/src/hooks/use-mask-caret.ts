import { useLayoutEffect, useRef } from "react";

/**
 * Keeps the caret where the user was editing a masked input. React resets a controlled input's caret to
 * the end whenever the displayed text differs from what was typed, so each mask reports where the caret
 * belongs (see `caretAfterSlots`) and this restores it after the re-render.
 */
export function useMaskCaret() {
	const ref = useRef<HTMLInputElement>(null);
	const pending = useRef<number | null>(null);

	const apply = () => {
		if (pending.current !== null && ref.current) {
			ref.current.setSelectionRange(pending.current, pending.current);
		}
		pending.current = null;
	};

	useLayoutEffect(apply);

	return {
		placeCaret: (position: number) => {
			pending.current = position;
			// Covers edits that leave the state unchanged and therefore never re-render.
			requestAnimationFrame(apply);
		},
		ref,
	};
}

/** Counts the editable characters (matching `slot`) in `text` before `end`. */
export function countSlots(text: string, slot: RegExp, end = text.length): number {
	return [...text.slice(0, end)].filter(char => slot.test(char)).length;
}

/** Caret position right after the n-th editable character of `display` (0 = start of the mask). */
export function caretAfterSlots(display: string, slot: RegExp, count: number): number {
	if (count <= 0) return 0;
	let seen = 0;
	for (let index = 0; index < display.length; index++) {
		if (slot.test(display[index] as string) && ++seen === count) return index + 1;
	}
	return display.length;
}
