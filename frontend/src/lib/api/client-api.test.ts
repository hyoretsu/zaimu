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
	useAuthStore.setState({ guestId: "transport-test", isAuthenticated: false, isGuestMode: true, user: null });
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
			await expect(client({ authenticated: false, method: "GET", url: "/tax-definitions" })).rejects.toThrow(
				"public failure",
			);
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
	it("honors per-request timeouts without retry", async () => {
		mockFetch(
			async (_input, options) =>
				new Promise((_resolve, reject) => {
					options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
				}),
		);
		await expect(client({ method: "POST", timeout: 10, url: "/transactions" })).rejects.toThrow();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uploads typed generated multipart fields without JSON encoding", async () => {
		const { postCreditCardImports } = await import(
			"./generated/api/hooks/creditCardImportsController/usePostCreditCardImports"
		);
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
