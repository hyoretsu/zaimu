import { expect, spyOn, test } from "bun:test";

test("server mutations stay successful when local cache writes fail", async () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	if (!originalWindow)
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { origin: "http://localhost" } },
		});
	const { useAuthStore } = await import("@/stores/auth");
	const { localCategories } = await import("./localStorage");
	const { dataService } = await import("./dataService");
	const originalAuth = useAuthStore.getState();
	useAuthStore.setState({
		isAuthenticated: true,
		isGuestMode: false,
		isInitialized: true,
		user: {
			createdAt: new Date(),
			email: "aran@example.com",
			emailVerified: true,
			id: "server-user",
			name: "Aran",
			updatedAt: new Date(),
		},
	});
	const category = { color: "#123456", id: "server-category", name: "Alimentação", userId: "server-user" };
	const cacheFailure = new Error("IndexedDB unavailable");
	const put = spyOn(localCategories, "put").mockRejectedValue(cacheFailure);
	const remove = spyOn(localCategories, "delete").mockRejectedValue(cacheFailure);
	const fetchMock = spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(Response.json(category))
		.mockResolvedValueOnce(Response.json(category))
		.mockResolvedValueOnce(Response.json(category));
	try {
		await expect(
			dataService.categories.create({ color: category.color, name: category.name }),
		).resolves.toEqual(category);
		await expect(dataService.categories.update(category.id, { name: "Mercado" })).resolves.toEqual(
			category,
		);
		await expect(dataService.categories.delete(category.id)).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(put).toHaveBeenCalledTimes(2);
		expect(remove).toHaveBeenCalledTimes(1);
		fetchMock.mockResolvedValueOnce(Response.json({ error: "Categoria inválida" }, { status: 400 }));
		await expect(dataService.categories.create({ color: category.color, name: "" })).rejects.toThrow(
			"Categoria inválida",
		);
		expect(put).toHaveBeenCalledTimes(2);
	} finally {
		put.mockRestore();
		remove.mockRestore();
		fetchMock.mockRestore();
		useAuthStore.setState(originalAuth);
		if (!originalWindow) Reflect.deleteProperty(globalThis, "window");
	}
});

test("guest yields replace all same-day kinds and reject date collisions", async () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	if (!originalWindow)
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { origin: "http://localhost" } },
		});
	const { useAuthStore } = await import("@/stores/auth");
	const { localMeta } = await import("./localStorage");
	const { dataService } = await import("./dataService");
	const originalAuth = useAuthStore.getState();
	useAuthStore.setState({ isGuestMode: true });
	const base = { amount: 1, date: "2026-01-05", financialAccountId: "account", isExcluded: false };
	const get = spyOn(localMeta, "get").mockResolvedValue([
		{ ...base, id: "calculated", kind: "AUTOMATIC" },
		{ ...base, id: "reported", kind: "MANUAL" },
	]);
	const set = spyOn(localMeta, "set").mockResolvedValue(undefined);
	try {
		const created = await dataService.accountYields.create({ ...base, amount: 2 });
		expect(set).toHaveBeenLastCalledWith("financial-account-yields", [created]);
		get.mockResolvedValue([created]);
		expect(await dataService.accountYields.upsertAutomatic({ ...base, amount: 1 })).toEqual(created);
		expect(set).toHaveBeenCalledTimes(1);
		get.mockResolvedValue([created, { ...created, date: "2026-01-06", id: "other-day" }]);
		await expect(
			dataService.accountYields.update(created.id, {
				amount: 2,
				date: "2026-01-06",
				isHidden: false,
				time: null,
			}),
		).rejects.toThrow("Já existe rendimento");
		expect(set).toHaveBeenCalledTimes(1);
	} finally {
		get.mockRestore();
		set.mockRestore();
		useAuthStore.setState(originalAuth);
		if (!originalWindow) Reflect.deleteProperty(globalThis, "window");
	}
});

test("statement day approval sends import ID and date in their correct URL segments", async () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	if (!originalWindow)
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { origin: "http://localhost" } },
		});
	const { useAuthStore } = await import("@/stores/auth");
	const { dataService } = await import("./dataService");
	const originalAuth = useAuthStore.getState();
	useAuthStore.setState({ isGuestMode: false });
	const result = { created: 3, finished: true };
	const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(result));
	try {
		const importId = "eae76ce7-e0ce-6529-a8a1-982c64ea1b3c";
		await expect(dataService.transactionImports.approveDay(importId, "2026-06-03")).resolves.toEqual(
			result,
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const request = fetchMock.mock.calls[0]![0] as Request;
		expect(request.method).toBe("POST");
		expect(new URL(request.url).pathname).toBe(
			`/transaction-imports/${importId}/days/2026-06-03/approve`,
		);
	} finally {
		fetchMock.mockRestore();
		useAuthStore.setState(originalAuth);
		if (!originalWindow) Reflect.deleteProperty(globalThis, "window");
	}
});
