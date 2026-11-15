import { topmostDialog } from "@/lib/scroll-keys";

type SubmitKeyEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

// Pure: Ctrl+Enter (Cmd+Enter on macOS) submits the form, even from a textarea.
export function isSubmitKey(event: SubmitKeyEvent) {
	return event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
}

function submitControls(form: HTMLFormElement) {
	return Array.from(form.elements).filter(
		(element): element is HTMLButtonElement | HTMLInputElement =>
			(element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
			element.type === "submit",
	);
}

// The form the key acts on: the one around the focused element, otherwise the one
// inside the topmost modal (focus can rest on its header or content).
export function findSubmitForm(target: Element | null) {
	const own = target?.closest("form");
	if (own) return own;
	return topmostDialog()?.querySelector("form") ?? null;
}

// Disabled submit buttons mean the form is pending or not ready: never bypass them.
export function submitForm(form: HTMLFormElement) {
	const controls = submitControls(form);
	if (!controls.length) return (form.requestSubmit(), true);
	const submitter = controls.find(control => !control.disabled);
	if (!submitter) return false;
	form.requestSubmit(submitter);
	return true;
}

// Modals that save through onClick instead of a <form>: the primary action is the last
// enabled button of the modal footer (Excluir/Descartar come before Salvar). A button
// marked data-submit-primary wins over that convention.
export function findPrimaryAction(target: Element | null) {
	const dialog = target?.closest('[data-slot="dialog-content"]') ?? topmostDialog();
	if (!dialog) return null;
	const marked = dialog.querySelector<HTMLButtonElement>("button[data-submit-primary]:not(:disabled)");
	if (marked) return marked;
	const buttons = dialog.querySelectorAll<HTMLButtonElement>(
		'[data-slot="dialog-footer"] button:not(:disabled)',
	);
	return buttons.item(buttons.length - 1);
}
