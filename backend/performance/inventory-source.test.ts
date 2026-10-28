import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventorySourceHash } from "./inventory-source";

test("fingerprint changes for mounted source, route screens and budgets; excludes tests", async () => {
	const root = await mkdtemp(join(tmpdir(), "zaimu-inventory-"));
	try {
		for (const path of [
			"backend/performance/budgets.ts",
			"backend/performance/inventory-schema.ts",
			"backend/performance/inventory-source.ts",
			"backend/performance/inventory.ts",
			"backend/scripts/export-openapi.ts",
			"backend/src/server.ts",
			"frontend/src/routes/cards/index.tsx",
		])
			await Bun.write(join(root, path), path);
		const original = await inventorySourceHash(root);
		expect(await inventorySourceHash(root)).toBe(original);
		await Bun.write(join(root, "backend/src/server.test.ts"), "test only");
		expect(await inventorySourceHash(root)).toBe(original);
		await Bun.write(join(root, "backend/src/server.ts"), "new mounted endpoint");
		const backendChanged = await inventorySourceHash(root);
		expect(backendChanged).not.toBe(original);
		await Bun.write(join(root, "frontend/src/routes/cards/index.tsx"), "changed screen");
		const screenChanged = await inventorySourceHash(root);
		expect(screenChanged).not.toBe(backendChanged);
		await Bun.write(join(root, "backend/performance/budgets.ts"), "changed budget");
		expect(await inventorySourceHash(root)).not.toBe(screenChanged);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});
