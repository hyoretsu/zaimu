import { inventoryRoutes } from "./inventory-schema";
import { inventorySourceHash } from "./inventory-source";

// Export declarations only: no listener, endpoint execution or shared service access.
const root = new URL("../../", import.meta.url).pathname;
const sourceHash = await inventorySourceHash(root);
const exportProcess = Bun.spawn(["bun", "backend/scripts/export-openapi.ts"], {
	cwd: root,
	stderr: "inherit",
	stdout: "inherit",
});
if (await exportProcess.exited) throw new Error("Cannot export current API inventory");
const routes = inventoryRoutes(await Bun.file(`${root}/backend/out/openapi.json`).json());
const screens = [];
for await (const source of new Bun.Glob("frontend/src/routes/**/*.tsx").scan(root)) {
	const text = await Bun.file(`${root}/${source}`).text();
	const path = text.match(/createFileRoute\(["']([^"']+)["']/)?.[1];
	if (path) screens.push({ path, requestBudget: null, result: "pending", source, usableP95Ms: 1000 });
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
if (sourceHash !== (await inventorySourceHash(root)))
	throw new Error("Sources changed while inventory was being generated; retry.");
const report = {
	journeys: journeys.map(name => ({ name, result: "pending" })),
	routes: routes.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`)),
	screens: screens.sort((a, b) => a.path.localeCompare(b.path)),
	sourceHash,
};
await Bun.write(new URL("./coverage.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ journeys: journeys.length, routes: routes.length, screens: screens.length }));
