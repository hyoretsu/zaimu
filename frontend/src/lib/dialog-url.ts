export interface DialogUrl {
	parameter: string;
	value: string;
	/** View parameters owned by this modal, removed from its background entry. */
	clear?: string[];
}

export function dialogUrlId(parameter: string) {
	return `url:${parameter}`;
}
export function isRestorableDialog(id: string, href: string) {
	return id.startsWith("url:") && new URL(href, "http://localhost").searchParams.has(id.slice(4));
}
export function dialogUrls(href: string, dialog: DialogUrl) {
	const foreground = new URL(href, "http://localhost");
	foreground.searchParams.set(dialog.parameter, dialog.value);
	const background = new URL(foreground);
	for (const parameter of [dialog.parameter, ...(dialog.clear ?? [])])
		background.searchParams.delete(parameter);
	const relative = (url: URL) => `${url.pathname}${url.search}${url.hash}`;
	return { background: relative(background), foreground: relative(foreground) };
}
