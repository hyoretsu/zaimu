import { useEffect } from "react";
import { findPrimaryAction, findSubmitForm, isSubmitKey, submitForm } from "@/lib/form-keys";

// Ctrl+Enter (Cmd+Enter on macOS) submits the current form from any field, including
// textareas. Goes through requestSubmit, so validation and submit handlers still run.
export function useFormKeys() {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || event.repeat || !isSubmitKey(event)) return;
			const target = event.target instanceof Element ? event.target : null;
			const form = findSubmitForm(target);
			if (form && submitForm(form)) return event.preventDefault();
			const action = findPrimaryAction(target);
			if (!action) return;
			event.preventDefault();
			action.click();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);
}
