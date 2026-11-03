import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Client } from "pg";
import { isGraphAncestor } from "./graph";

const root = resolve(import.meta.dir, "..");
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("prisma/package.json")), "dist/prisma.js");
const contract = JSON.parse(await readFile(join(root, "out/prisma/contract.json"), "utf8"));
const formatBaseline = "7c4f89dec910830b905b2b49e39826a4b35ebebb6f01cdcd35c2b73d88e84dad";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for the explicit migration action");
const connection = new Client({ connectionString: url });
await connection.connect();
let current: string | undefined;
try {
	const present = await connection.query<{ marker: string | null }>(
		"SELECT to_regclass('prisma_contract.marker')::text AS marker",
	);
	if (present.rows[0].marker)
		current = (
			await connection.query<{ core_hash: string }>(
				"SELECT core_hash FROM prisma_contract.marker WHERE space='app'",
			)
		).rows[0]?.core_hash;
	if (!current) {
		const tables = await connection.query<{ count: string }>(
			"SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema='public'",
		);
		if (Number(tables.rows[0].count) > 0)
			throw new Error("Database has tables but no contract marker; baseline refused before mutation");
	}
} finally {
	await connection.end();
}
const run = async (...args: string[]) => {
	const child = Bun.spawn(["bun", cli, ...args, "--db", url], {
		cwd: root,
		env: { ...process.env, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
		stderr: "inherit",
		stdout: "inherit",
	});
	if (await child.exited) throw new Error(`Prisma ${args.join(" ")} failed`);
};
const native =
	current && (await isGraphAncestor(join(root, "migrations/app"), current, contract.storage.storageHash));
// No marker: an empty database is built by the native baseline below.
if (current && current !== contract.storage.storageHash && current !== formatBaseline && !native) {
	throw new Error("Unknown database marker; migration refused before mutation");
}
if (!current || contract.storage.storageHash !== formatBaseline) await run("db", "migrate");
await run("db", "verify");
