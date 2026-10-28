import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

if (!globalThis.window)
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
const { useAuthStore } = await import("@/stores/auth");
const { default: client, ConnectivityError, SessionChangedError } = await import("./client-api");

const originalFetch = globalThis.fetch;
const mockFetch = (implementation: (...args: Parameters<typeof fetch>) => Promise<Response>) =>
	fetchMock.mockImplementation(Object.assign(implementation, { preconnect: originalFetch.preconnect }));
const originalAuth = useAuthStore.getState();
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
beforeEach(() => {
	useAuthStore.setState({
		guestId: "transport-test",
		isAuthenticated: false,
		isGuestMode: true,
		user: null,
	});
	fetchMock = spyOn(globalThis, "fetch");
	mockFetch(async () => Response.json({ date: "2026-10-17" }));
});
afterEach(() => {
	fetchMock.mockRestore();
	useAuthStore.setState(originalAuth);
});

describe("shared SDK transport", () => {
	it("sends cookies, currency and custom headers while preserving JSON dates", async () => {
		let request: Request | undefined;
		mockFetch(async input => {
			request = input instanceof Request ? input : new Request(input);
			return Response.json({ date: "2026-10-17" });
		});
		const result = await client<{ date: string }>({
			headers: { "X-Test": "value" },
			method: "GET",
			url: "/financial-accounts",
		});
		expect(request?.credentials).toBe("include");
		expect(request?.headers.get("X-Currency")).toMatch(/^[A-Z]{3}$/);
		expect(request?.headers.get("X-Test")).toBe("value");
		expect(result.data.date).toBe("2026-10-17");
	});
	it("never retries failed mutations", async () => {
		mockFetch(async () => Response.json({ error: "failed" }, { status: 503 }));
		await expect(client({ data: { amount: 10 }, method: "POST", url: "/transactions" })).rejects.toThrow(
			"failed",
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("keeps rate limiting separate from expired sessions", async () => {
		const logout = spyOn(useAuthStore.getState(), "logout").mockResolvedValue(undefined);
		try {
			mockFetch(async () => Response.json({ error: "limited" }, { status: 429 }));
			await expect(client({ method: "GET", url: "/financial-accounts" })).rejects.toThrow(
				"Muitas solicitações",
			);
			expect(logout).not.toHaveBeenCalled();
		} finally {
			logout.mockRestore();
		}
	});
	it("rejects late responses after identity changes", async () => {
		mockFetch(async () => {
			useAuthStore.setState({ guestId: "other-user" });
			return Response.json({ error: "expired" }, { status: 401 });
		});
		await expect(client({ method: "GET", url: "/financial-accounts" })).rejects.toBeInstanceOf(
			SessionChangedError,
		);
		expect(useAuthStore.getState().guestId).toBe("other-user");
	});
	it("classifies connectivity failures", async () => {
		mockFetch(async () => {
			throw new TypeError("offline");
		});
		await expect(client({ method: "GET", url: "/financial-accounts" })).rejects.toBeInstanceOf(
			ConnectivityError,
		);
	});
	it("preserves multipart boundaries without imposing JSON", async () => {
		const body = new FormData();
		body.set("file", new File(["statement"], "statement.csv"));
		mockFetch(async input => {
			const request = input instanceof Request ? input : new Request(input);
			expect(request.headers.get("Content-Type")).toStartWith("multipart/form-data; boundary=");
			expect((await request.formData()).get("file")).toBeInstanceOf(File);
			return Response.json({ success: true });
		});
		await client({ data: body, method: "POST", url: "/transaction-imports" });
	});
	it("allows public endpoint failures without logging out", async () => {
		const logout = spyOn(useAuthStore.getState(), "logout").mockResolvedValue(undefined);
		try {
			mockFetch(async () => Response.json({ error: "public failure" }, { status: 401 }));
			await expect(
				client({ authenticated: false, method: "GET", url: "/tax-definitions" }),
			).rejects.toThrow("public failure");
			expect(logout).not.toHaveBeenCalled();
		} finally {
			logout.mockRestore();
		}
	});
	it("honors cancellation before sending a request", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			client({ method: "GET", signal: controller.signal, url: "/financial-accounts" }),
		).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it("cancels an in-flight operation without retry", async () => {
		const controller = new AbortController();
		let started!: () => void;
		const sending = new Promise<void>(resolve => {
			started = resolve;
		});
		mockFetch(
			async (input, options) =>
				new Promise((_resolve, reject) => {
					const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
					signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
					started();
				}),
		);
		const pending = client({ method: "POST", signal: controller.signal, url: "/transactions" });
		await sending;
		controller.abort(new DOMException("Cancelled", "AbortError"));
		await expect(pending).rejects.toThrow("Cancelled");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("rejects late successful responses after identity changes", async () => {
		mockFetch(async () => {
			useAuthStore.setState({ guestId: "new-identity" });
			return Response.json({ id: "old-identity-record" });
		});
		await expect(client({ method: "GET", url: "/financial-accounts" })).rejects.toBeInstanceOf(
			SessionChangedError,
		);
	});
	it("waits beyond Ky's default timeout for reads and mutations", async () => {
		mockFetch(async () => {
			await Bun.sleep(10_100);
			return Response.json({ success: true });
		});
		const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
		const results = await Promise.all(
			methods.map(method =>
				client<{ success: boolean }>({ method, url: "/transactions" }, { timeout: undefined }),
			),
		);
		expect(results.every(result => result.data.success)).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(methods.length);
	}, 15_000);

	it("honors per-request timeouts without retry", async () => {
		mockFetch(
			async (_input, options) =>
				new Promise((_resolve, reject) => {
					options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
						once: true,
					});
				}),
		);
		await expect(client({ method: "POST", timeout: 10, url: "/transactions" })).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uploads typed generated multipart fields without JSON encoding", async () => {
		const { postCreditCardImports } =
			await import("./generated/api/hooks/creditCardImportsController/usePostCreditCardImports");
		mockFetch(async input => {
			const request = input instanceof Request ? input : new Request(input);
			const body = await request.formData();
			expect(request.headers.get("Content-Type")).toStartWith("multipart/form-data; boundary=");
			expect(body.get("creditCardId")).toBe("card");
			expect(body.get("provider")).toBe("INTER");
			expect(body.get("password")).toBe("1234");
			expect(body.get("file")).toBeInstanceOf(File);
			return Response.json({ creditCardImport: null, ignoredCount: 0 });
		});
		await postCreditCardImports({
			creditCardId: "card",
			file: new File(["pdf"], "statement.pdf"),
			password: "1234",
			provider: "INTER",
		});
	});
});

it("batches registered list actions and preserves individual errors", async () => {
	const requests: Request[] = [];
	mockFetch(async input => {
		const request = input instanceof Request ? input : new Request(input);
		requests.push(request);
		const { operations } = await request.json();
		return Response.json({
			results: operations.map((operation: { id: string; path: string }) => ({
				data: operation.path.includes("/b/") ? { error: "Sem permissão" } : { created: 1 },
				id: operation.id,
				status: operation.path.includes("/b/") ? 403 : 200,
			})),
		});
	});
	const results = await Promise.allSettled([
		client<{ created: number }>({ method: "POST", url: "/credit-card-imports/import/items/a/approve" }),
		client({ method: "POST", url: "/credit-card-imports/import/items/b/approve" }),
	]);
	expect(requests).toHaveLength(1);
	expect(new URL(requests[0]!.url).pathname).toBe("/batch");
	expect(results[0].status).toBe("fulfilled");
	expect(results[1].status).toBe("rejected");
});

it("drops queued writes immediately on session change, including switching away and back", async () => {
	const result = client({ method: "DELETE", url: "/transactions/a" }).catch(error => error);
	useAuthStore.setState({ guestId: "different" });
	useAuthStore.setState({ guestId: "transport-test" });
	expect(await result).toBeInstanceOf(SessionChangedError);
	expect(fetchMock).not.toHaveBeenCalled();
});

it("flushes queued list writes before bulk/form mutations", async () => {
	const order: string[] = [];
	mockFetch(async input => {
		const request = input instanceof Request ? input : new Request(input);
		const path = new URL(request.url).pathname;
		order.push(path);
		if (path === "/batch") {
			const { operations } = await request.json();
			return Response.json({
				results: operations.map((operation: { id: string }) => ({
					data: null,
					id: operation.id,
					status: 204,
				})),
			});
		}
		return Response.json({ created: 0 });
	});
	await Promise.all([
		client({ method: "POST", url: "/transaction-imports/import/items/a/approve" }),
		client({ method: "POST", url: "/transaction-imports/import/approve" }),
	]);
	expect(order).toEqual(["/batch", "/transaction-imports/import/approve"]);
});

it("keeps unrelated forms immediate while list actions wait for their debounce", async () => {
	const order: string[] = [];
	mockFetch(async input => {
		const request = input instanceof Request ? input : new Request(input);
		const path = new URL(request.url).pathname;
		order.push(path);
		if (path !== "/batch") return Response.json({ id: "new" });
		const { operations } = await request.json();
		return Response.json({
			results: operations.map((operation: { id: string }) => ({
				data: null,
				id: operation.id,
				status: 204,
			})),
		});
	});
	const pending = client({ method: "DELETE", url: "/transactions/a" });
	await client({ data: { name: "New" }, method: "POST", url: "/categories" });
	expect(order).toEqual(["/categories"]);
	await pending;
	expect(order).toEqual(["/categories", "/batch"]);
});

it("keeps different currency/header contexts in separate envelopes", async () => {
	const contexts: string[] = [];
	mockFetch(async input => {
		const request = input instanceof Request ? input : new Request(input);
		contexts.push(request.headers.get("x-currency")!);
		const { operations } = await request.json();
		expect(operations).toHaveLength(1);
		return Response.json({
			results: operations.map((operation: { id: string }) => ({
				data: null,
				id: operation.id,
				status: 204,
			})),
		});
	});
	await Promise.all([
		client({ headers: { "X-Currency": "BRL" }, method: "DELETE", url: "/transactions/a" }),
		client({ headers: { "X-Currency": "USD" }, method: "DELETE", url: "/transactions/b" }),
	]);
	expect(contexts.sort()).toEqual(["BRL", "USD"]);
});

it("never replays an uncertain batch and asks for a refresh", async () => {
	mockFetch(async () => Response.json({ error: "proxy unavailable" }, { status: 503 }));
	await expect(client({ method: "DELETE", url: "/transactions/a" })).rejects.toThrow("Atualize os dados");
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("ignores an in-flight batch even when the same identity returns before its response", async () => {
	mockFetch(async input => {
		const request = input instanceof Request ? input : new Request(input);
		const { operations } = await request.json();
		useAuthStore.setState({ guestId: "another-session" });
		useAuthStore.setState({ guestId: "transport-test" });
		return Response.json({
			results: operations.map((operation: { id: string }) => ({
				data: null,
				id: operation.id,
				status: 204,
			})),
		});
	});
	await expect(client({ method: "DELETE", url: "/transactions/a" })).rejects.toBeInstanceOf(
		SessionChangedError,
	);
});

it("submits recurrence approval forms directly without a batch envelope", async () => {
	const paths: string[] = [];
	mockFetch(async input => {
		const request = input instanceof Request ? input : new Request(input);
		paths.push(new URL(request.url).pathname);
		expect(await request.json()).toEqual({
			recurrence: { date: "2026-10-01", recurrenceId: "recurrence" },
		});
		return Response.json({ created: 1 });
	});
	await client({
		batch: false,
		data: { recurrence: { date: "2026-10-01", recurrenceId: "recurrence" } },
		method: "POST",
		url: "/credit-card-imports/import/items/purchase/approve",
	});
	expect(paths).toEqual(["/credit-card-imports/import/items/purchase/approve"]);
});
