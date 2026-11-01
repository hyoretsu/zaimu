import { existsSync } from "node:fs";
import { cp, mkdir, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { assertFixtureUrl } from "../../../scripts/testing/fixture";
import { installContractFixture } from "./contract-fixture";

const sqlRoot = resolve(import.meta.dir, "..");
const initial = "e6f952d8b8937cd3db66ef01b911c808e91e407738cd3f63387ad6c760107756";
const legacy = "b4da9448c1f0b792deb9ebb08526b9deb09a9a5fb51c3cf9a1691391e49137e0";

/** Prepare schemas only inside the runner's disposable database and temporary migration tree. */
export async function prepareSchema(
	file: string,
	url: string,
	env: Record<string, string | undefined>,
	tempRoot: string,
	onChild?: (child: ReturnType<typeof Bun.spawn> | undefined) => void,
) {
	const fresh =
		file.endsWith("prisma8-fresh-history.e2e.test.ts") ||
		file.endsWith("prisma8-native-successors.e2e.test.ts");
	const full =
		fresh ||
		file.endsWith("database.e2e.test.ts") ||
		file.endsWith("migrations.e2e.test.ts") ||
		file.endsWith("prisma8-runtime.integration.test.ts") ||
		file.endsWith("prisma8-contract-parity.integration.test.ts") ||
		file.endsWith("normalized-refunds.test.ts") ||
		file.endsWith("import-purchase-taxes.integration.test.ts") ||
		file.endsWith("src/tests/query-metrics.test.ts") ||
		file.endsWith("RabbitMqBroker.integration.test.ts") ||
		file.endsWith("open-finance.integration.test.ts") ||
		file.endsWith("materialization.test.ts");
	const backfill = file.endsWith("credit-purchases-backfill.test.ts");
	const cutover = file.endsWith("credit-ledger-cutover.test.ts");
	if (!full && !backfill && !cutover) return;
	assertFixtureUrl(url, env);
	if (fresh) {
		const child = Bun.spawn(["bun", join(sqlRoot, "scripts/migrate.ts")], {
			cwd: sqlRoot,
			env: { ...env, DATABASE_URL: url },
			stderr: "inherit",
			stdout: "inherit",
			timeout: 240000,
		});
		onChild?.(child);
		const code = await child.exited;
		onChild?.(undefined);
		if (code !== 0) throw new Error("Production migration failed on empty disposable database");
		return;
	}
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		const hash = full
			? initial
			: cutover
				? "a08745da75bf1dc6481b60f5dbbb59e2bc58c5a1e5ffc7a24cd64884daa36a66"
				: legacy;
		if (!fresh)
			await installContractFixture(
				client,
				await Bun.file(join(sqlRoot, "migrations/snapshots", hash, "contract.json")).json(),
			);
	} finally {
		await client.end();
	}
	if (!full) return;
	const copy = join(tempRoot, `migration-${crypto.randomUUID()}`);
	await mkdir(copy, { recursive: true });
	for (const name of ["migrations", "out", "src", "scripts", "prisma.config.ts", "package.json"])
		await cp(join(sqlRoot, name), join(copy, name), { recursive: true });
	// Execute immutable early-RC history using its original toolchain, never the app client.
	const historicalRoot = join(sqlRoot, "compatibility/early-rc");
	const historicalModules = join(historicalRoot, "node_modules");
	if (!existsSync(join(historicalModules, "@prisma/cli/dist/cli.js")))
		throw new Error("Install frozen historical replay dependencies before running disposable tests");
	await cp(join(historicalRoot, "prisma.config.ts"), join(copy, "prisma.config.ts"));
	await symlink(historicalModules, join(copy, "node_modules"), "dir");
	const head = "1ce00365762f398d639512abcc6b130d22364beea5f36452debb2fdb137caa62";
	await mkdir(join(copy, "out/prisma"), { recursive: true });
	for (const name of ["contract.json", "contract.d.ts"])
		await cp(join(copy, "migrations/snapshots", head, name), join(copy, "out/prisma", name));
	const source = await Bun.file(join(sqlRoot, "src/prisma/contract.prisma")).text();
	await writeFile(
		join(copy, "src/prisma/contract.prisma"),
		source.replaceAll("TimestampJsDate(", "Timestamp(").replaceAll("TimestamptzJsDate(", "Timestamptz("),
	);
	// Hoisted installs keep dependencies in the workspace root instead of packages/sql.
	const modulesDir = [join(sqlRoot, "node_modules"), resolve(sqlRoot, "../../node_modules")].find(dir =>
		existsSync(join(dir, "prisma/dist/prisma.js")),
	);
	if (!modulesDir) throw new Error("Disposable schema preparation failed: prisma is not installed");
	const prismaCli = join(historicalModules, "@prisma/cli/dist/cli.js");
	if (fresh) await unlink(join(copy, "migrations/app/refs/db.json"));
	else
		await Bun.write(
			join(copy, "migrations/app/refs/db.json"),
			JSON.stringify({ hash: initial, invariants: [] }),
		);
	const environment = { ...env, DATABASE_URL: url, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" };
	const invariants = new Set<string>();
	for (const entry of await readdir(join(copy, "migrations/app"), { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === "refs") continue;
		const manifest = await Bun.file(join(copy, "migrations/app", entry.name, "migration.json")).json();
		for (const invariant of manifest.providedInvariants ?? []) invariants.add(invariant);
	}
	await writeFile(
		join(copy, "migrations/app/refs/disposable-history.json"),
		JSON.stringify({ hash: head, invariants: [...invariants].sort() }),
	);
	for (const args of [
		...(fresh ? [] : [["db", "sign", "--contract", initial]]),
		["migrate", "--advance-ref", "db"],
	]) {
		const command =
			args[0] === "migrate"
				? ["bun", prismaCli, "migrate", "--to", "disposable-history", "--advance-ref", "db"]
				: ["bun", prismaCli, ...args];
		const process = Bun.spawn(command, {
			cwd: copy,
			env: environment,
			stderr: "inherit",
			stdout: "inherit",
			timeout: 120000,
		});
		onChild?.(process);
		const code = await process.exited;
		onChild?.(undefined);
		if (code !== 0) throw new Error(`Disposable schema preparation failed: prisma-cli ${args.join(" ")}`);
	}
	// Verification is read-only: never adopt a new format marker before proving physical parity.
	const latestCli = join(modulesDir, "prisma/dist/prisma.js");
	if (file.endsWith("migrations.e2e.test.ts")) {
		const upgrade = Bun.spawn(["bun", join(sqlRoot, "scripts/migrate.ts")], {
			cwd: sqlRoot,
			env: environment,
			stderr: "inherit",
			stdout: "inherit",
			timeout: 240000,
		});
		onChild?.(upgrade);
		const upgraded = await upgrade.exited;
		onChild?.(undefined);
		if (upgraded !== 0) throw new Error("Production wrapper rejected legacy-marker upgrade fixture");
	}
	const verification = Bun.spawn(["bun", latestCli, "db", "verify", "--schema-only", "--db", url], {
		cwd: sqlRoot,
		env: environment,
		stderr: "inherit",
		stdout: "inherit",
		timeout: 120000,
	});
	onChild?.(verification);
	const verified = await verification.exited;
	onChild?.(undefined);
	if (verified !== 0) throw new Error("Latest RC rejected the physically replayed historical schema");
}
