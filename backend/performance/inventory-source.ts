import { createHash } from "node:crypto";

export async function inventorySourceHash(root = new URL("../../", import.meta.url).pathname) {
	const paths = new Set([
		"backend/performance/budgets.ts",
		"backend/performance/inventory-schema.ts",
		"backend/performance/inventory-source.ts",
		"backend/performance/inventory.ts",
		"backend/scripts/export-openapi.ts",
	]);
	for (const pattern of ["backend/src/**/*.ts", "frontend/src/routes/**/*.tsx"]) {
		for await (const path of new Bun.Glob(pattern).scan(root)) {
			if (!path.endsWith(".test.ts") && !path.includes("/tests/")) paths.add(path);
		}
	}
	const hash = createHash("sha256");
	for (const path of [...paths].sort()) {
		hash.update(`${path}\0`);
		hash.update(new Uint8Array(await Bun.file(`${root}/${path}`).arrayBuffer()));
	}
	return hash.digest("hex");
}
