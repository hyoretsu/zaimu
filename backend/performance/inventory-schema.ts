import { performanceBudgets } from "./budgets";

const methods = new Set(["get", "post", "patch", "put", "delete", "head", "options"]);
const authActions = [
	"sign-in/email",
	"sign-up/email",
	"get-session",
	"verify-email",
	"request-password-reset",
	"reset-password",
	"sign-out",
	"revoke-session",
	"revoke-sessions",
	"delete-user",
];

export function inventoryRoutes(document: { paths: Record<string, Record<string, unknown>> }) {
	const routes: { method: string; path: string; source: string; budget: number; result: string }[] = [];
	for (const [openApiPath, operations] of Object.entries(document.paths)) {
		const path = openApiPath.replace(/\{([^}]+)\}/g, ":$1");
		if (!path.startsWith("/")) throw new Error(`Invalid inventory path: ${path}`);
		for (const [method, operation] of Object.entries(operations)) {
			if (!methods.has(method)) continue;
			if (!operation || typeof operation !== "object")
				throw new Error(`Invalid inventory operation: ${method} ${path}`);
			const budget = Object.values(performanceBudgets).find(
				value => value.path.split("?")[0].replace(/\/$/, "") === path.replace(/\/$/, ""),
			);
			routes.push({
				budget: method === "get" ? (budget?.coldP95Ms ?? 1000) : 1000,
				method: method.toUpperCase(),
				path,
				result: "pending",
				source: `OpenAPI: ${"operationId" in operation ? String(operation.operationId) : `${method} ${path}`}`,
			});
		}
	}
	if (!routes.length) throw new Error("OpenAPI inventory has no operations");
	for (const action of authActions) {
		const route = {
			budget: 1000,
			method: action === "get-session" || action === "verify-email" ? "GET" : "POST",
			path: `/api/auth/${action}`,
			result: "pending",
			source: "Better Auth",
		};
		if (!routes.some(existing => existing.method === route.method && existing.path === route.path))
			routes.push(route);
	}
	return routes.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

export function assertInventoryCurrent(inventory: { sourceHash?: string }, sourceHash: string) {
	if (!sourceHash || inventory.sourceHash !== sourceHash)
		throw new Error(
			"Performance inventory is stale. Run bun backend/performance/inventory.ts before measuring.",
		);
}
