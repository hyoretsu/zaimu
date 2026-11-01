import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Client } from "pg";
import { isGraphAncestor, isHistoricalAncestor, replayHistoricalGraph } from "./historical-replay";

const root = resolve(import.meta.dir, "..");
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("prisma/package.json")), "dist/prisma.js");
const contract = JSON.parse(await readFile(join(root, "out/prisma/contract.json"), "utf8"));
const formatBaseline = "f1e9933a7a2ab046fbdbbe4f7219a89cdb4f66db7796a06516f826ff2d6d36a3";
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
} finally {
	await connection.end();
}
const baselineConfig = join(root, "compatibility/native-baseline/prisma.config.ts");
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
	current &&
	(await isGraphAncestor(join(root, "migrations-native/app"), current, contract.storage.storageHash));
if (current !== contract.storage.storageHash && current !== formatBaseline && !native) {
	if (current && !(await isHistoricalAncestor(root, current)))
		throw new Error("Unknown database marker; historical replay and adoption refused before mutation");
	await replayHistoricalGraph(root, url);
	await run("db", "verify", "--schema-only", "--config", baselineConfig);
	await run("db", "sign", "--no-advance-ref", "--config", baselineConfig);
}
if (contract.storage.storageHash !== formatBaseline) await run("db", "migrate");
await run("db", "verify");
// Historical graph is deliberately immutable and is executed only by its pinned toolchain.
// Native migrations live separately so latest tooling never parses historical snapshot formats.
