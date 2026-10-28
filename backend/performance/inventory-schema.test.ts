import { expect, test } from "bun:test";
import { assertInventoryCurrent, inventoryRoutes } from "./inventory-schema";

test("inventory uses mounted OpenAPI paths, including composed controllers and preference modules", () => {
	const routes = inventoryRoutes({
		paths: {
			"/country-preferences": { parameters: [], patch: { operationId: "patchCountryPreferences" } },
			"/credit-cards/{id}": { delete: { operationId: "deleteCard" }, get: { operationId: "getCard" } },
			"/dashboard/comparison": { get: { operationId: "getDashboardComparison" } },
			"/health": { get: { operationId: "getHealth" } },
		},
	});
	expect(
		routes
			.filter(route => route.source !== "Better Auth")
			.map(({ method, path }) => `${method} ${path}`)
			.sort(),
	).toEqual(
		[
			"PATCH /country-preferences",
			"DELETE /credit-cards/:id",
			"GET /credit-cards/:id",
			"GET /dashboard/comparison",
			"GET /health",
		].sort(),
	);
	expect(routes.some(route => route.path === "/comparison")).toBeFalse();
	expect(routes.filter(route => route.source === "Better Auth")).toHaveLength(10);
	expect(routes.every(route => route.result === "pending" && route.budget === 1000)).toBeTrue();
});

test("empty, invalid or stale inventory cannot permit acceptance", () => {
	expect(() => inventoryRoutes({ paths: {} })).toThrow("no operations");
	expect(() => inventoryRoutes({ paths: { "/cards": { get: null } } })).toThrow(
		"Invalid inventory operation",
	);
	expect(() => inventoryRoutes({ paths: { cards: { get: {} } } })).toThrow("Invalid inventory path");
	expect(() => assertInventoryCurrent({}, "new")).toThrow("stale");
	expect(() => assertInventoryCurrent({ sourceHash: "old" }, "new")).toThrow("stale");
	expect(() => assertInventoryCurrent({ sourceHash: "" }, "")).toThrow("stale");
	expect(() => assertInventoryCurrent({ sourceHash: "current" }, "current")).not.toThrow();
});
