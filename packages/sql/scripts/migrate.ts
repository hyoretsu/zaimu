import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@prisma/cli/package.json")), "dist/cli.js");
const migrations = join(root, "migrations/app");
const contract = JSON.parse(await readFile(join(root, "out/prisma/contract.json"), "utf8"));
const invariants = new Set<string>();
for (const entry of await readdir(migrations, { withFileTypes: true })) {
	if (!entry.isDirectory() || entry.name === "refs") continue;
	const manifest = JSON.parse(await readFile(join(migrations, entry.name, "migration.json"), "utf8"));
	for (const invariant of manifest.providedInvariants ?? []) invariants.add(invariant);
}
// The CLI's default app target omits data invariants. Require every versioned data migration.
const reference = `deploy-${crypto.randomUUID().replaceAll("-", "")}`;
const path = join(migrations, "refs", `${reference}.json`);
await writeFile(
	path,
	JSON.stringify({ hash: contract.storage.storageHash, invariants: [...invariants].sort() }),
);
try {
	const child = Bun.spawn(
		["bun", cli, "migrate", "--to", reference, "--advance-ref", "db", ...process.argv.slice(2)],
		{ cwd: root, env: process.env, stderr: "inherit", stdout: "inherit" },
	);
	process.exitCode = await child.exited;
} finally {
	await unlink(path);
}
