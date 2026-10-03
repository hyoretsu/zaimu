import { expect, test } from "bun:test";
import { PluggyClient, PluggyDiscoveryUnavailable } from "./pluggy-client";

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
test("item discovery follows the supplied cursor and rejects cycles", async () => {
	const paths: string[] = [];
	let cyclic = false;
	const client = new PluggyClient(credentials, async url => {
		const target = new URL(url);
		if (target.pathname === "/auth") return Response.json({ apiKey: "mock" });
		paths.push(target.pathname + target.search);
		return Response.json({
			next: target.search && !cyclic ? null : "?after=cursor%2Fnext",
			results: [{ id: paths.length.toString() }],
		});
	});
	expect(await client.items()).toHaveLength(2);
	expect(paths).toEqual(["/v2/items", "/v2/items?after=cursor%2Fnext"]);
	cyclic = true;
	await expect(client.items()).rejects.toThrow("Paginação de conexões");
});
test("disabled item listing is distinct from invalid credentials and 429", async () => {
	let status = 403;
	const client = new PluggyClient(credentials, async url =>
		url.endsWith("/auth")
			? Response.json({ apiKey: "mock" })
			: Response.json({ code: status, codeDescription: "LIST_ITEMS_FEATURE_NOT_ENABLED" }, { status }),
	);
	await expect(client.items()).rejects.toBeInstanceOf(PluggyDiscoveryUnavailable);
	status = 429;
	await expect(client.items()).rejects.toThrow("Limite de consultas");
});
