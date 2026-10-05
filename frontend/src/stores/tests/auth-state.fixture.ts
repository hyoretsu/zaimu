/** biome-ignore-all lint/suspicious/noMisplacedAssertion: Standalone subprocess assertions isolate auth module mocks from the parent test runner. */

import { mock } from "bun:test";
import assert from "node:assert/strict";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (key: string) => values.get(key) ?? null,
		removeItem: (key: string) => values.delete(key),
		setItem: (key: string, value: string) => values.set(key, value),
	},
});
let session: (options?: { fetchOptions: { method: string } }) => Promise<unknown>;
mock.module("../../lib/auth-client", () => ({
	authClient: {
		getSession: (options?: { fetchOptions: { method: string } }) => session(options),
		signOut: async () => ({ error: { status: 429 } }),
	},
	getAuthErrorMessage: () => "Unavailable",
}));
const { useAuthStore: store } = await import("../auth");
let resolve!: (value: unknown) => void;
let calls = 0;
session = () => {
	calls++;
	return new Promise(done => {
		resolve = done;
	});
};
const first = store.getState().initialize();
assert.equal(store.getState().initialize(), first);
store.getState().enableGuestMode();
resolve({ data: { user: { id: "old" } } });
await first;
assert.equal(calls, 1);
assert.equal(store.getState().isGuestMode, true);
assert.equal(store.getState().isAuthenticated, false);
const user = {
	createdAt: new Date(),
	email: "fixture@zaimu.local",
	emailVerified: true,
	id: "fixture",
	name: "Fixture",
	updatedAt: new Date(),
};
store.setState({ isAuthenticated: true, isGuestMode: false, isInitialized: true, user });
session = async () => ({ data: null, error: { status: 429 } });
await store.getState().initialize();
assert.equal(store.getState().isAuthenticated, true);
assert.equal(store.getState().user?.id, user.id);
assert.equal(store.getState().isSessionUnavailable, true);
assert.equal(store.getState().isRateLimited, true);
await store.getState().logout();
assert.equal(store.getState().isAuthenticated, true);
session = async () => ({ data: null, error: null });
await store.getState().initialize();
assert.equal(store.getState().isAuthenticated, false);
assert.equal(store.getState().isSessionUnavailable, false);

const methods: string[] = [];
session = async options => {
	methods.push(options!.fetchOptions.method);
	return options!.fetchOptions.method === "POST"
		? { data: null, error: { status: 503 } }
		: { data: { user }, error: null };
};
await store.getState().initialize();
assert.deepEqual(methods, ["POST", "GET"]);
assert.equal(store.getState().isAuthenticated, true);
assert.equal(store.getState().isSessionUnavailable, false);
session = async () => ({ data: null, error: { status: 503 } });
await store.getState().initialize();
assert.equal(store.getState().isSessionUnavailable, true);
assert.equal(store.getState().user?.id, user.id);
