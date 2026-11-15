import { expect, test } from "bun:test";
import { resolveScrollKey } from "./scroll-keys";

const key = (value: string, modifiers: Partial<Parameters<typeof resolveScrollKey>[0]> = {}) =>
	resolveScrollKey({
		altKey: false,
		ctrlKey: false,
		key: value,
		metaKey: false,
		shiftKey: false,
		...modifiers,
	});

test("Home and End jump to the edges of the vertical axis", () => {
	expect(key("Home")).toEqual({ axis: "y", direction: -1, edge: true });
	expect(key("End")).toEqual({ axis: "y", direction: 1, edge: true });
	expect(key("End", { ctrlKey: true })).toEqual({ axis: "y", direction: 1, edge: true });
});

test("page, line and horizontal keys resolve their axis and direction", () => {
	expect(key("PageUp")).toEqual({ axis: "y", direction: -1, page: true });
	expect(key("ArrowDown")).toEqual({ axis: "y", direction: 1 });
	expect(key("ArrowLeft")).toEqual({ axis: "x", direction: -1 });
});

test("Space pages down and Shift+Space pages up, yielding to buttons", () => {
	expect(key(" ")).toEqual({ activation: true, axis: "y", direction: 1, page: true });
	expect(key(" ", { shiftKey: true })?.direction).toBe(-1);
});

test("browser and selection shortcuts are left alone", () => {
	expect(key("Home", { shiftKey: true })).toBeNull();
	expect(key("ArrowDown", { ctrlKey: true })).toBeNull();
	expect(key("Home", { altKey: true })).toBeNull();
	expect(key("a")).toBeNull();
});
