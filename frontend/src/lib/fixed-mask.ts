import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";

const SLOT = /[\d_]/;

/** Select the digit slots (filled or still `_`) a native insertion will overwrite, never the suffix. */
function selectOverwrite(input: HTMLInputElement, text: string) {
	const count = text.replace(/\D/g, "").length;
	if (!count) return;
	const start = input.selectionStart ?? 0;
	let end = input.selectionEnd ?? start;
	let occupied = [...input.value.slice(start, end)].filter(char => SLOT.test(char)).length;
	while (end < input.value.length && occupied < count) {
		if (SLOT.test(input.value[end])) occupied++;
		end++;
	}
	input.setSelectionRange(start, end);
}

export function fixedMaskKeyDown(event: KeyboardEvent<HTMLInputElement>) {
	if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
	if (/^\d$/.test(event.key)) selectOverwrite(event.currentTarget, event.key);
}

export function fixedMaskBeforeInput(event: FormEvent<HTMLInputElement>) {
	const input = event.nativeEvent as InputEvent;
	if (input.isComposing || input.inputType?.includes("Composition")) return;
	if (input.data && (!input.inputType || input.inputType === "insertText")) {
		selectOverwrite(event.currentTarget, input.data);
	}
}

export function fixedMaskPaste(event: ClipboardEvent<HTMLInputElement>) {
	selectOverwrite(event.currentTarget, event.clipboardData.getData("text"));
}
