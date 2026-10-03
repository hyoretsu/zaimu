import { expect, test } from "bun:test";
import { PluggyClient } from "./pluggy-client";

const credentials = { clientId: "test", clientSecret: "secret" };
test("fetches every page and renews expired token once", async () => {
	let auth = 0;
	const pages: number[] = [];
	let expired = true;
	const client = new PluggyClient(credentials, async (url, init) => {
		if (url.endsWith("/auth")) return Response.json({ apiKey: `token-${++auth}` });
		if (expired) {
			expired = false;
			return new Response(null, { status: 401 });
		}
		expect(new Headers(init?.headers).get("X-API-KEY")).toBe("token-2");
		const page = Number(new URL(url).searchParams.get("page"));
		pages.push(page);
		return Response.json({ page, results: [{ id: String(page) }], totalPages: 3 });
	});
	const results = [];
	for await (const page of client.pages("/transactions?accountId=account")) results.push(...page);
	expect(results).toHaveLength(3);
	expect(pages).toEqual([1, 2, 3]);
	expect(auth).toBe(2);
});
test("429 is an integration error without upstream body or secret", async () => {
	const client = new PluggyClient(credentials, async () => new Response("secret upstream", { status: 429 }));
	await expect(client.validate()).rejects.toThrow("Limite de consultas Pluggy");
});
test("concurrent reads share authentication", async () => {
	let auth = 0;
	const client = new PluggyClient(credentials, async url =>
		url.endsWith("/auth") ? Response.json({ apiKey: String(++auth) }) : Response.json({ id: "item" }),
	);
	await Promise.all([client.item("one"), client.item("two")]);
	expect(auth).toBe(1);
});
