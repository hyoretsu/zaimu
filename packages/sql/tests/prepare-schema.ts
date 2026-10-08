import { cp, mkdir, symlink } from "node:fs/promises";
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
	const full =
		file.endsWith("database.e2e.test.ts") ||
		file.endsWith("migrations.e2e.test.ts") ||
		file.endsWith("normalized-refunds.test.ts") ||
		file.endsWith("src/tests/query-metrics.test.ts") ||
		file.endsWith("RabbitMqBroker.integration.test.ts") ||
		file.endsWith("open-finance.integration.test.ts") ||
		file.endsWith("materialization.test.ts");
	const backfill = file.endsWith("credit-purchases-backfill.test.ts");
	const cutover = file.endsWith("credit-ledger-cutover.test.ts");
	if (!full && !backfill && !cutover) return;
	assertFixtureUrl(url, env);
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		const hash = full
			? initial
			: cutover
				? "a08745da75bf1dc6481b60f5dbbb59e2bc58c5a1e5ffc7a24cd64884daa36a66"
				: legacy;
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
	await symlink(join(sqlRoot, "node_modules"), join(copy, "node_modules"), "dir");
	await Bun.write(
		join(copy, "migrations/app/refs/db.json"),
		JSON.stringify({ hash: initial, invariants: [] }),
	);
	const environment = { ...env, DATABASE_URL: url, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" };
	for (const args of [
		["db", "sign", "--contract", initial],
		["migrate", "--advance-ref", "db"],
	]) {
		const process = Bun.spawn(["bun", join(sqlRoot, "node_modules/@prisma/cli/dist/cli.js"), ...args], {
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
}
