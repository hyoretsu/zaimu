import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function worker() {
	const listeners = new Map<string, (event: unknown) => void>();
	const visited: string[] = [];
	const client = {
		focus: async () => undefined,
		navigate: async (url: string) => {
			visited.push(url);
		},
		url: "https://app.zaimu.com/auth",
	};
	runInNewContext(readFileSync(new URL("../../public/push-sw.js", import.meta.url), "utf8"), {
		self: {
			addEventListener: (name: string, handler: (event: unknown) => void) =>
				listeners.set(name, handler),
			clients: {
				matchAll: async () => [client],
				openWindow: async (url: string) => {
					visited.push(url);
				},
			},
			location: { origin: "https://app.zaimu.com" },
		},
		URL,
	});
	return { listeners, visited };
}
test("push tap preserves transfer review when an existing window is on authentication", async () => {
	const { listeners, visited } = worker();
	let pending: Promise<void> | undefined;
	listeners.get("notificationclick")!({
		notification: {
			close: () => undefined,
			data: { url: "https://app.zaimu.com/account-transfers?transfer=invite" },
		},
		waitUntil: (promise: Promise<void>) => {
			pending = promise;
		},
	});
	await pending;
	expect(visited).toEqual(["https://app.zaimu.com/account-transfers?transfer=invite"]);
});
test("push tap rejects external destinations and action endpoints", () => {
	for (const url of [
		"https://untrusted.example/account-transfers?transfer=invite",
		"https://app.zaimu.com/account-transfers/invite/accept",
	]) {
		const { listeners, visited } = worker();
		let pending = false;
		listeners.get("notificationclick")!({
			notification: { close: () => undefined, data: { url } },
			waitUntil: () => {
				pending = true;
			},
		});
		expect(pending).toBe(false);
		expect(visited).toHaveLength(0);
	}
});
