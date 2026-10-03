import { expect, spyOn, test } from "bun:test";
import type { Recurrence } from "./recurrence";

const record: Recurrence = {
	amount: 10,
	createdAt: "2026-10-01T00:00:00Z",
	destinationFinancialAccountId: "account",
	id: "recurrence",
	interval: 1,
	isActive: true,
	materializedThrough: "2026-10-01",
	movement: "INCOME",
	name: "Receipt",
	startDate: "2026-10-01",
	unit: "DAY",
	updatedAt: "2026-10-01T00:00:00Z",
	userId: "server-user",
};

async function setup() {
	if (!globalThis.window)
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { origin: "http://localhost" } },
		});
	const { localRecurrences } = await import("./localStorage");
	const { createRecurrenceService } = await import("./recurrence-service");
	const service = createRecurrenceService({
		fetchWithAuth: async <T>(endpoint: string): Promise<T> =>
			(endpoint === "/recurring" ? [record] : record) as T,
		getUserId: () => record.userId,
		hydrateLocalDebtSplit: async () => null,
		isGuestMode: () => false,
	});
	return { localRecurrences, service };
}

test("authenticated recurrence list succeeds when local cache cannot be read or written", async () => {
	const { localRecurrences, service } = await setup();
	const getAll = spyOn(localRecurrences, "getAll").mockRejectedValue(new Error("IndexedDB unavailable"));
	const replace = spyOn(localRecurrences, "replaceSnapshot").mockRejectedValue(new Error("Quota exceeded"));
	try {
		await expect(service.getAll()).resolves.toEqual([record]);
		getAll.mockResolvedValue([]);
		await expect(service.getAll()).resolves.toEqual([record]);
		expect(replace).toHaveBeenCalledTimes(1);
	} finally {
		getAll.mockRestore();
		replace.mockRestore();
	}
});

test("authenticated recurrence list returns while local cache remains pending", async () => {
	const { localRecurrences, service } = await setup();
	const getAll = spyOn(localRecurrences, "getAll").mockImplementation(() => new Promise(() => {}));
	try {
		const result = await Promise.race([
			service.getAll(),
			new Promise(resolve => setTimeout(() => resolve("blocked"), 100)),
		]);
		expect(result).toEqual([record]);
	} finally {
		getAll.mockRestore();
	}
});

test("authenticated recurrence detail and mutations succeed despite cache failure", async () => {
	const { localRecurrences } = await setup();
	const { createRecurrenceService } = await import("./recurrence-service");
	let failRequest = false;
	const service = createRecurrenceService({
		fetchWithAuth: async <T>(): Promise<T> => {
			if (failRequest) throw new Error("Server rejected recurrence");
			return record as T;
		},
		getUserId: () => record.userId,
		hydrateLocalDebtSplit: async () => null,
		isGuestMode: () => false,
	});
	const put = spyOn(localRecurrences, "put").mockRejectedValue(new Error("IndexedDB unavailable"));
	try {
		await expect(service.get(record.id)).resolves.toEqual(record);
		await expect(service.create(record)).resolves.toEqual(record);
		await expect(service.update(record.id, { name: "Updated" })).resolves.toEqual(record);
		expect(put).toHaveBeenCalledTimes(3);
		failRequest = true;
		await expect(service.update(record.id, { name: "Updated" })).rejects.toThrow(
			"Server rejected recurrence",
		);
		expect(put).toHaveBeenCalledTimes(3);
	} finally {
		put.mockRestore();
	}
});
