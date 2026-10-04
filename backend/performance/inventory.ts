import { performanceBudgets } from "./budgets";

// Source inventory runs without importing the application or connecting to shared services.
const root = new URL("../../", import.meta.url).pathname;
const routes: { method: string; path: string; source: string; budget: number; result: string }[] = [];
for await (const source of new Bun.Glob("backend/src/**/*Controller.ts").scan(root)) {
	const text = await Bun.file(`${root}/${source}`).text();
	const prefix = text.match(/prefix:\s*["']([^"']+)["']/)?.[1] ?? "";
	for (const match of text.matchAll(
		/(?:^\s*|new Elysia\([^\n]*\))\.(get|post|patch|put|delete)\(\s*["']([^"']+)["']/gm,
	)) {
		const path = `${prefix}${match[2]}`;
		const known = Object.values(performanceBudgets).find(budget => budget.path.split("?")[0] === path);
		routes.push({
			budget: match[1] === "get" ? (known?.coldP95Ms ?? 1000) : 1000,
			method: match[1]!.toUpperCase(),
			path,
			result: "pending",
			source,
		});
	}
}
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
for (const action of authActions)
	routes.push({
		budget: 1000,
		method: action === "get-session" || action === "verify-email" ? "GET" : "POST",
		path: `/api/auth/${action}`,
		result: "pending",
		source: "Better Auth",
	});
const screens = [];
for await (const source of new Bun.Glob("frontend/src/routes/**/*.tsx").scan(root)) {
	const text = await Bun.file(`${root}/${source}`).text();
	const path = text.match(/createFileRoute\(["']([^"']+)["']/)?.[1];
	if (path) screens.push({ path, requestBudget: 3, result: "pending", source, usableP95Ms: 1000 });
}
const journeys = [
	"web startup",
	"desktop startup",
	"Android startup",
	"iOS startup",
	"offline",
	"guest migration",
	"identity switch",
	"sync 100k",
	"statement import 1000",
	"invoice import 1000",
	"outbox",
	"invalidation",
	"materialization",
	"rates",
	"yield recalculation",
	"backlog/retry/DLQ",
	"50 navigation cycles",
	"deep links/background",
];
const report = {
	journeys: journeys.map(name => ({ name, result: "pending" })),
	routes: routes.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`)),
	screens: screens.sort((a, b) => a.path.localeCompare(b.path)),
};
await Bun.write(new URL("./coverage.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ journeys: journeys.length, routes: routes.length, screens: screens.length }));
