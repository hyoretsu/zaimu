import { join, resolve } from "node:path";
import { assertFixtureUrl } from "../../../scripts/testing/fixture";

const sqlRoot = resolve(import.meta.dir, "..");

/** Prepare schemas only inside the runner's disposable database and temporary migration tree. */
export async function prepareSchema(
	file: string,
	url: string,
	env: Record<string, string | undefined>,
	tempRoot: string,
	onChild?: (child: ReturnType<typeof Bun.spawn> | undefined) => void,
) {
	const full =
		file.endsWith("migrate-transition.e2e.test.ts") ||
		file.endsWith("prisma8-fresh-history.e2e.test.ts") ||
		file.endsWith("prisma8-native-successors.e2e.test.ts") ||
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
	if (!full) return;
	assertFixtureUrl(url, env);
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
}
