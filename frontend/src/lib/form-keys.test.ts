import { expect, test } from "bun:test";
import { isSubmitKey } from "./form-keys";

const press = (modifiers: Partial<Parameters<typeof isSubmitKey>[0]> = {}) =>
	isSubmitKey({
		altKey: false,
		ctrlKey: false,
		key: "Enter",
		metaKey: false,
		shiftKey: false,
		...modifiers,
	});

test("Ctrl+Enter and Cmd+Enter submit", () => {
	expect(press({ ctrlKey: true })).toBe(true);
	expect(press({ metaKey: true })).toBe(true);
});

test("plain, Shift or Alt Enter and other keys do not submit", () => {
	expect(press()).toBe(false);
	expect(press({ ctrlKey: true, shiftKey: true })).toBe(false);
	expect(press({ altKey: true, ctrlKey: true })).toBe(false);
	expect(press({ ctrlKey: true, key: "a" })).toBe(false);
});
