export type ScrollAxis = "x" | "y";
export type ScrollDirection = -1 | 1;

export interface ScrollKeyCommand {
	axis: ScrollAxis;
	direction: ScrollDirection;
	// Space activates buttons, so it must not scroll when one has focus.
	activation?: boolean;
	edge?: boolean;
	page?: boolean;
}

type ScrollKeyEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

const LINE_STEP = 40;
const PAGE_RATIO = 0.875;

// Elements that own these keys (caret movement, option navigation, value changes).
const KEY_OWNERS = [
	"input",
	"textarea",
	"select",
	'[contenteditable]:not([contenteditable="false"])',
	...[
		"combobox",
		"grid",
		"gridcell",
		"listbox",
		"menu",
		"menuitem",
		"menuitemcheckbox",
		"menuitemradio",
		"option",
		"radio",
		"radiogroup",
		"scrollbar",
		"slider",
		"spinbutton",
		"tab",
		"tablist",
		"textbox",
		"tree",
		"treeitem",
	].map(role => `[role="${role}"]`),
].join(",");
const ACTIVATABLE = 'button,a[href],summary,[role="button"],[role="checkbox"],[role="link"],[role="switch"]';

const DIRECTIONAL_KEYS: Record<string, Pick<ScrollKeyCommand, "axis" | "direction" | "edge" | "page">> = {
	ArrowDown: { axis: "y", direction: 1 },
	ArrowLeft: { axis: "x", direction: -1 },
	ArrowRight: { axis: "x", direction: 1 },
	ArrowUp: { axis: "y", direction: -1 },
	End: { axis: "y", direction: 1, edge: true },
	Home: { axis: "y", direction: -1, edge: true },
	PageDown: { axis: "y", direction: 1, page: true },
	PageUp: { axis: "y", direction: -1, page: true },
};

// Pure: maps a key event to the scroll it should perform, or null to leave it alone.
export function resolveScrollKey(event: ScrollKeyEvent): ScrollKeyCommand | null {
	if (event.altKey || event.metaKey) return null;
	if (event.key === " ")
		return event.ctrlKey
			? null
			: { activation: true, axis: "y", direction: event.shiftKey ? -1 : 1, page: true };
	const command = DIRECTIONAL_KEYS[event.key];
	if (!command || event.shiftKey) return null;
	// Ctrl+Home/End jump like Home/End; other Ctrl combinations belong to the browser.
	if (event.ctrlKey && !command.edge) return null;
	return command;
}

export function ownsScrollKey(target: Element | null, command: ScrollKeyCommand) {
	if (!target) return false;
	return Boolean(target.closest(KEY_OWNERS) || (command.activation && target.closest(ACTIVATABLE)));
}

function extent(element: HTMLElement, axis: ScrollAxis) {
	return axis === "y"
		? { client: element.clientHeight, offset: element.scrollTop, size: element.scrollHeight }
		: { client: element.clientWidth, offset: element.scrollLeft, size: element.scrollWidth };
}

function scrollsOn(element: HTMLElement, axis: ScrollAxis) {
	const style = getComputedStyle(element);
	const { client, size } = extent(element, axis);
	return /auto|scroll|overlay/.test(axis === "y" ? style.overflowY : style.overflowX) && size > client + 1;
}

function canMove(element: HTMLElement, axis: ScrollAxis, direction: ScrollDirection) {
	const { client, offset, size } = extent(element, axis);
	return direction < 0 ? offset > 0 : offset < size - client - 1;
}

// Nearest scroll container from `origin` outward that scrolls on `axis`. With a
// direction it must also have room to move that way, so scrolling chains outward.
export function findScroller(
	origin: Element | null,
	boundary: Element | null,
	axis: ScrollAxis,
	direction?: ScrollDirection,
) {
	for (let node = origin; node; node = node.parentElement) {
		if (node === document.body || node === document.documentElement) break;
		if (
			node instanceof HTMLElement &&
			scrollsOn(node, axis) &&
			(!direction || canMove(node, axis, direction))
		)
			return node;
		if (node === boundary) return null;
	}
	if (boundary) return null;
	const page = document.scrollingElement;
	return page instanceof HTMLElement && (!direction || canMove(page, axis, direction)) ? page : null;
}

// Header/footer clicks have no scroller above them; look down for the modal's own region.
export function findScrollerWithin(container: Element, axis: ScrollAxis, direction?: ScrollDirection) {
	for (const viewport of container.querySelectorAll<HTMLElement>('[data-slot="scroll-area-viewport"]'))
		if (scrollsOn(viewport, axis) && (!direction || canMove(viewport, axis, direction))) return viewport;
	return null;
}

export function topmostDialog() {
	const open = document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"]');
	let top: HTMLElement | null = null;
	for (const dialog of open)
		if (!top || (Number(dialog.style.zIndex) || 0) >= (Number(top.style.zIndex) || 0)) top = dialog;
	return top;
}

export function scrollByCommand(element: HTMLElement, command: ScrollKeyCommand) {
	const { client, offset, size } = extent(element, command.axis);
	const next = command.edge
		? command.direction < 0
			? 0
			: size - client
		: offset + command.direction * (command.page ? client * PAGE_RATIO : LINE_STEP);
	const smooth = (command.edge || command.page) && !matchMedia("(prefers-reduced-motion: reduce)").matches;
	element.scrollTo({
		behavior: smooth ? "smooth" : "auto",
		[command.axis === "y" ? "top" : "left"]: next,
	});
}

export function wheelDistance(event: WheelEvent, element: HTMLElement) {
	const delta = event.deltaX || event.deltaY;
	if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_STEP;
	if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * element.clientWidth * PAGE_RATIO;
	return delta;
}
