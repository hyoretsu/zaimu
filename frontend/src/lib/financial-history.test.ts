import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

if (!globalThis.window)
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
const { localMeta } = await import("./localStorage");
const { useAuthStore } = await import("@/stores/auth");
const { readCurrencyRate } = await import("./financial-history");
const { SessionChangedError } = await import("./api/client-api");
const originalAuth = useAuthStore.getState();
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalFetch = globalThis.fetch;
const cached = new Map<string, unknown>();
let online = true;
let request: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let read: ReturnType<typeof spyOn<typeof localMeta, "get">>;
let write: ReturnType<typeof spyOn<typeof localMeta, "set">>;
const rate = { date: "2026-10-01", from: "USD", rate: 5.2, to: "BRL" };
beforeEach(() => {
	cached.clear();
	online = true;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			get onLine() {
				return online;
			},
		},
	});
	useAuthStore.setState({ guestId: "history-first", isAuthenticated: false, isGuestMode: true, user: null });
	request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(rate));
	read = spyOn(localMeta, "get").mockImplementation(async (key, owner) => cached.get(`${owner}:${key}`));
	write = spyOn(localMeta, "set").mockImplementation(async (key, value, owner) => {
		cached.set(`${owner}:${key}`, value);
	});
});
afterEach(() => {
	request.mockRestore();
	read.mockRestore();
	write.mockRestore();
	useAuthStore.setState(originalAuth, true);
	if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
	else Reflect.deleteProperty(globalThis, "navigator");
});
test("history retains exact cache keys and isolates offline rates by owner", async () => {
	expect(await readCurrencyRate("2026-10-01", "usd", "brl")).toEqual(rate);
	expect(write).toHaveBeenCalledWith(
		"financial-history:/rate?date=2026-10-01&from=USD&to=BRL:",
		rate,
		"guest:history-first",
	);
	online = false;
	expect(await readCurrencyRate("2026-10-01", "USD", "BRL")).toEqual(rate);
	useAuthStore.setState({ guestId: "history-second" });
	expect(await readCurrencyRate("2026-10-01", "USD", "BRL")).toBeNull();
	expect(request).toHaveBeenCalledTimes(1);
});
test("history rejects malformed cached responses using generated schemas", async () => {
	cached.set("guest:history-first:financial-history:/rate?date=2026-10-01&from=USD&to=BRL:", {
		...rate,
		rate: "invalid",
	});
	online = false;
	expect(await readCurrencyRate("2026-10-01", "USD", "BRL")).toBeNull();
});
test("late public history responses never populate another identity", async () => {
	request.mockImplementation(
		Object.assign(
			async () => {
				useAuthStore.setState({ guestId: "history-second" });
				return Response.json(rate);
			},
			{ preconnect: originalFetch.preconnect },
		),
	);
	await expect(readCurrencyRate("2026-10-01", "USD", "BRL")).rejects.toBeInstanceOf(SessionChangedError);
	expect(write).not.toHaveBeenCalled();
});
