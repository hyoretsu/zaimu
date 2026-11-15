import { useEffect } from "react";
import { findSubmitForm, isSubmitKey, submitForm } from "@/lib/form-keys";

// Ctrl+Enter (Cmd+Enter on macOS) submits the current form from any field, including
// textareas. Goes through requestSubmit, so validation and submit handlers still run.
export function useFormKeys() {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || event.repeat || !isSubmitKey(event)) return;
			const form = findSubmitForm(event.target instanceof Element ? event.target : null);
			if (form && submitForm(form)) event.preventDefault();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);
}
