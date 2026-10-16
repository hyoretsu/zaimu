import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("guest invoice payment preference persists and stays isolated by owner", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => {
				values.delete(key);
			},
			setItem: (key: string, value: string) => {
				values.set(key, value);
			},
		},
	});
	const { useAuthStore } = await import("@/stores/auth");
	const { readInvoicePaymentPreference, saveInvoicePaymentPreference } = await import(
		"./invoice-payment-preference"
	);
	useAuthStore.setState({ guestId: "invoice-a", isAuthenticated: false, isGuestMode: true, user: null });
	expect(await readInvoicePaymentPreference()).toBe("DUE_DATE");
	await saveInvoicePaymentPreference("CLOSING_DATE");
	expect(await readInvoicePaymentPreference()).toBe("CLOSING_DATE");
	useAuthStore.setState({ guestId: "invoice-b" });
	expect(await readInvoicePaymentPreference()).toBe("DUE_DATE");
	useAuthStore.setState({ guestId: "invoice-a" });
	expect(await readInvoicePaymentPreference()).toBe("CLOSING_DATE");
});
