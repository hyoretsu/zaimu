import { beforeEach, expect, test } from "bun:test";

// Auth configuration reads the browser origin while modules initialize.
if (typeof window === "undefined") {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost", pathname: "/accounts", search: "" } },
	});
}
const {
	runBackgroundModalAction,
	useModalRecoveryStore,
	configureModalRecoveryNavigation,
	requestModalRecovery,
	takeModalRecovery,
} = await import("./background-modal-actions");
const { useAuthStore } = await import("@/stores/auth");
const { toast } = await import("sonner");
const settle = async () => {
	for (let index = 0; index < 15; index++) await Promise.resolve();
};
beforeEach(() => {
	useAuthStore.setState({ guestId: "test-modal", isAuthenticated: false, isGuestMode: true });
	useModalRecoveryStore.setState({ entries: {}, pending: {}, requestedId: null });
	window.location.pathname = "/accounts";
	window.location.search = "";
	toast.dismiss();
});
const base = {
	close: () => {},
	conflictKey: "record:a",
	failureMessage: "Failed",
	loadingMessage: "Saving",
	recovery: { entityId: "a", kind: "test", payload: { name: "Preserved" } },
	successMessage: "Saved",
};
test("closes synchronously, prevents duplicate writes, leaves unrelated records available", async () => {
	let finish!: () => void;
	let calls = 0;
	let closes = 0;
	const run = () => {
		calls++;
		return new Promise<void>(resolve => {
			finish = resolve;
		});
	};
	const action = {
		...base,
		close: () => {
			closes++;
		},
		run,
	};
	runBackgroundModalAction(action);
	runBackgroundModalAction(action);
	expect(closes).toBe(1);
	expect(useModalRecoveryStore.getState().pending["guest:test-modal:record:a"]).toBeTrue();
	let unrelated = false;
	runBackgroundModalAction({
		...base,
		conflictKey: "record:b",
		run: async () => {
			unrelated = true;
		},
	});
	await settle();
	expect(calls).toBe(1);
	expect(unrelated).toBeTrue();
	finish();
	await settle();
	expect(useModalRecoveryStore.getState().pending["guest:test-modal:record:a"]).toBeUndefined();
});
test("failed operation survives navigation and recovers exact values on its original route", async () => {
	runBackgroundModalAction({
		...base,
		run: async () => {
			throw new Error("Unavailable");
		},
	});
	window.location.pathname = "/settings";
	await settle();
	const entry = Object.values(useModalRecoveryStore.getState().entries)[0]!;
	let navigation = "";
	configureModalRecoveryNavigation(async path => {
		navigation = path;
	});
	requestModalRecovery(entry.id);
	expect(navigation).toBe("/accounts");
	await settle();
	expect(takeModalRecovery("test")).toBeNull();
	window.location.pathname = "/accounts";
	expect(takeModalRecovery("test")?.payload).toEqual({ name: "Preserved" });
	expect(useModalRecoveryStore.getState().requestedId).toBeNull();
});
test("cache refresh failure retries refresh without repeating successful write", async () => {
	let writes = 0;
	let refreshes = 0;
	runBackgroundModalAction({
		...base,
		onSuccess: async () => {
			refreshes++;
			if (refreshes === 1) throw new Error("Refresh failed");
		},
		run: async () => {
			writes++;
			return "saved";
		},
	});
	await settle();
	expect(Object.keys(useModalRecoveryStore.getState().entries)).toHaveLength(0);
	const notification = toast
		.getHistory()
		.find(
			item =>
				"action" in item &&
				item.action &&
				typeof item.action === "object" &&
				"label" in item.action &&
				item.action.label === "Tentar atualizar",
		);
	expect(notification).toBeDefined();
	const action = notification && "action" in notification ? notification.action : undefined;
	if (action && typeof action === "object" && "onClick" in action) action.onClick({} as never);
	await settle();
	expect(writes).toBe(1);
	expect(refreshes).toBe(2);
});
test("identity change clears drafts and ignores failures from previous identity", async () => {
	let reject!: (reason: Error) => void;
	runBackgroundModalAction({
		...base,
		run: () =>
			new Promise<void>((_, fail) => {
				reject = fail;
			}),
	});
	await settle();
	useAuthStore.setState({ guestId: "another-user" });
	reject(new Error("Old failure"));
	await settle();
	expect(Object.keys(useModalRecoveryStore.getState().entries)).toHaveLength(0);
});

test("overlapping batch locks both records while independent work remains available", async () => {
	let finish!: () => void;
	let conflicting = 0;
	runBackgroundModalAction({
		...base,
		conflictKey: "batch",
		conflictKeys: ["record:a", "record:b"],
		run: () =>
			new Promise<void>(resolve => {
				finish = resolve;
			}),
	});
	runBackgroundModalAction({
		...base,
		conflictKey: "record:b",
		run: async () => {
			conflicting++;
		},
	});
	await settle();
	expect(conflicting).toBe(0);
	expect(useModalRecoveryStore.getState().pending["guest:test-modal:record:a"]).toBeTrue();
	expect(useModalRecoveryStore.getState().pending["guest:test-modal:record:b"]).toBeTrue();
	finish();
	await settle();
	expect(Object.keys(useModalRecoveryStore.getState().pending)).toHaveLength(0);
});
test("record progress leaves loading feedback inside the affected listing", async () => {
	let finish!: () => void;
	runBackgroundModalAction({
		...base,
		loadingMessage: "Row-only progress",
		progress: "record",
		run: () =>
			new Promise<void>(resolve => {
				finish = resolve;
			}),
	});
	await settle();
	expect(toast.getHistory().some(item => "title" in item && item.title === "Row-only progress")).toBeFalse();
	finish();
	await settle();
});

test("background cache policy waits for persistence and ignores an identity change", async () => {
	const { QueryClient } = await import("@tanstack/react-query");
	const { queryKeys } = await import("./query-cache");
	for (const changeIdentity of [false, true]) {
		const client = new QueryClient();
		useAuthStore.setState({ guestId: "test-modal" });
		const key = queryKeys.accounts.list("guest:test-modal");
		client.setQueryData(key, []);
		let finish!: () => void;
		const persisted = new Promise<void>(resolve => {
			finish = resolve;
		});
		let completions = 0;
		runBackgroundModalAction({
			...base,
			cache: { client, operations: ["account"] },
			onSuccess: () => {
				completions++;
			},
			run: () => persisted,
		});
		await settle();
		expect(client.getQueryState(key)?.isInvalidated).toBe(false);
		if (changeIdentity) useAuthStore.setState({ guestId: "other" });
		finish();
		await settle();
		expect(client.getQueryState(key)?.isInvalidated).toBe(!changeIdentity);
		expect(completions).toBe(changeIdentity ? 0 : 1);
		client.clear();
	}
});
