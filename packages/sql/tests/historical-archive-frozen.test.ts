import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// The historical graph is a frozen, unexecuted-for-new-databases archive (plan 0040). New migrations are
// native successors in migrations-native/app. Adding, renaming or removing an archive entry fails here,
// which also protects the cut-off from stale branches that still carry a historical migration.
const archive = join(import.meta.dir, "../migrations");
const digest = (names: string[]) =>
	createHash("sha256")
		.update(`${names.sort().join("\n")}\n`)
		.digest("hex");

test("the historical migration archive contains exactly the frozen 113 migrations", () => {
	const migrations = readdirSync(join(archive, "app"), { withFileTypes: true })
		.filter(entry => entry.isDirectory() && entry.name !== "refs")
		.map(entry => entry.name);
	expect(migrations).toHaveLength(113);
	expect(digest(migrations)).toBe("c21c6e022c9a9ceb1f668a78f15a2c551d5f580f5fafbb3bb03f8c0d0f01343e");
});

test("the historical snapshot archive contains exactly the frozen 111 snapshots", () => {
	const snapshots = readdirSync(join(archive, "snapshots"));
	expect(snapshots).toHaveLength(111);
	expect(digest(snapshots)).toBe("7aeadd652716f509e2e0547be652a2acb9e924369023b9da992329ca7c4dfb4a");
});
