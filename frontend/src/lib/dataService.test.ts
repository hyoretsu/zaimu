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
		await expect(dataService.categories.update(category.id, { name: "Mercado" })).resolves.toEqual(category);
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
