export function parseTransferDeepLink(raw: string): { id: string } | null {
	try {
		const url = new URL(raw);
		const path = url.protocol === "zaimu:" ? `/${url.hostname}${url.pathname}` : url.pathname;
		if (
			!["https:", "http:", "zaimu:"].includes(url.protocol) ||
			path.replace(/\/$/, "") !== "/account-transfers"
		)
			return null;
		const id = url.searchParams.get("transfer");
		return id && /^[a-zA-Z0-9-]{1,36}$/.test(id) ? { id } : null;
	} catch {
		return null;
	}
}
