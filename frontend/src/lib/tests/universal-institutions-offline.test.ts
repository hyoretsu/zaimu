import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("offline catalog isolates owners and allows only cached approved institutions", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { languages: ["pt-BR"], onLine: false },
	});
	const persisted = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => persisted.get(key) ?? null,
			removeItem: (key: string) => persisted.delete(key),
			setItem: (key: string, value: string) => persisted.set(key, value),
		},
	});
	const { useAuthStore } = await import("@/stores/auth");
	const { localMeta } = await import("../localStorage");
	const { dataService } = await import("../dataService");
	useAuthStore.setState({
		isAuthenticated: true,
		isGuestMode: false,
		user: { id: "offline-owner" } as NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>,
	});
	const approved = { currency: "BRL", id: "approved", name: "Banco aprovado", status: "APPROVED" as const };
	await localMeta.set(
		"institution-catalog",
		[approved, { ...approved, id: "private", status: "PENDING" }],
		"user:offline-owner",
	);
	const account = await dataService.accounts.create({
		countryCode: "BR",
		currency: "BRL",
		institutionId: "approved",
		name: "Conta offline",
		type: "CHECKING",
	});
	expect(account.institution?.id).toBe("approved");
	expect(account.countryCode).toBe("BR");
	await expect(
		dataService.accounts.create({ institutionId: "private", name: "Privada", type: "CHECKING" }),
	).rejects.toThrow("aprovada");
	await expect(
		dataService.accounts.create({ institutionName: "Nova instituição", name: "Proposta", type: "CHECKING" }),
	).rejects.toThrow("conexão");
	useAuthStore.setState({
		user: { id: "other-owner" } as NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>,
	});
	expect(await dataService.financialInstitutions.getAll()).toEqual([]);
});
