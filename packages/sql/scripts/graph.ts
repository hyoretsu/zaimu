import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function isGraphAncestor(directory: string, hash: string, target: string) {
	if (!/^[a-f0-9]{64}$/.test(hash)) return false;
	const edges = new Map<string, string[]>();
	const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
		if (error.code === "ENOENT") return [];
		throw error;
	});
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "refs") continue;
		const manifest = await Bun.file(join(directory, entry.name, "migration.json")).json();
		const targets = edges.get(manifest.from) ?? [];
		targets.push(manifest.to);
		edges.set(manifest.from, targets);
	}
	const seen = new Set<string>();
	const pending = [hash];
	while (pending.length) {
		const node = pending.pop()!;
		if (node === target) return true;
		if (seen.has(node)) continue;
		seen.add(node);
		pending.push(...(edges.get(node) ?? []));
	}
	return false;
}

/** Explicit migration action only; no dependency installation, application imports or source mutation. */
