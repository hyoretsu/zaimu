import { describe, expect, test } from "bun:test";
import { captureScrollPosition, restoreScrollPosition } from "./scroll-position";

function fixture() {
	const element = {
		getBoundingClientRect: () => ({ bottom: 120, left: 0, right: 390, top: 0 }),
		isConnected: true,
		querySelectorAll: () => [anchor],
		scrollLeft: 500,
		scrollTop: 80,
	};
	let insertedWidth = 0;
	const anchor = {
		getBoundingClientRect: () => ({
			bottom: 80,
			left: 540 + insertedWidth - element.scrollLeft,
			right: 684 + insertedWidth - element.scrollLeft,
			top: 0,
		}),
		isConnected: true,
	};
	return {
		anchor,
		element,
		insert: () => {
			insertedWidth += 912;
		},
	};
}

describe("navigation scroll restoration", () => {
	test("keeps the visible invoice when URL selection prepends older invoices", () => {
		const { element, insert } = fixture();
		const position = captureScrollPosition(element as unknown as HTMLElement);
		insert();
		restoreScrollPosition(position);
		expect(element.scrollLeft).toBe(1412);
	});

	test("does not undo or double-apply the invoice layout effect compensation", () => {
		const { element, insert } = fixture();
		const position = captureScrollPosition(element as unknown as HTMLElement);
		insert();
		element.scrollLeft += 912;
		restoreScrollPosition(position);
		expect(element.scrollLeft).toBe(1412);
		restoreScrollPosition(position);
		expect(element.scrollLeft).toBe(1412);
	});

	test("restores ordinary viewport offsets when the anchor disappears", () => {
		const { element, anchor } = fixture();
		const position = captureScrollPosition(element as unknown as HTMLElement);
		anchor.isConnected = false;
		element.scrollLeft = 0;
		element.scrollTop = 0;
		restoreScrollPosition(position);
		expect(element.scrollLeft).toBe(500);
		expect(element.scrollTop).toBe(80);
	});
});
