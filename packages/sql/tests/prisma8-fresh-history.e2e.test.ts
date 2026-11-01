import { expect, test } from "bun:test";
import { join } from "node:path";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";

const url = requireFixtureUrl("DATABASE_TEST_URL");

test("empty database replays immutable history including all data invariants", async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		const tables = await client.query<{ count: string }>(
			"SELECT count(*)::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
		);
		expect(Number(tables.rows[0].count)).toBeGreaterThanOrEqual(90);
		const seeds = await client.query<{ count: string }>('SELECT count(*)::text FROM "taxDefinition"');
		expect(Number(seeds.rows[0].count)).toBeGreaterThan(0);
		const views = await client.query<{ name: string }>(
			"SELECT viewname AS name FROM pg_views WHERE schemaname='public'",
		);
		expect(views.rows.length).toBeGreaterThan(0);
		const before = await client.query("SELECT * FROM prisma_contract.marker");
		const migration = join(import.meta.dir, "../scripts/migrate.ts");
		const run = async () => {
			const child = Bun.spawn(["bun", migration], {
				cwd: join(import.meta.dir, ".."),
				env: { ...process.env, DATABASE_URL: url, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
				stderr: "pipe",
				stdout: "pipe",
			});
			const [output, errors] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);
			return { code: await child.exited, output: output + errors };
		};
		await client.query("UPDATE prisma_contract.marker SET core_hash=$1 WHERE space='app'", [
			"f".repeat(64),
		]);
		const unknown = await client.query("SELECT * FROM prisma_contract.marker");
		const refusal = await run();
		expect(refusal.code).not.toBe(0);
		expect(refusal.output).toContain("Unknown database marker");
		expect((await client.query("SELECT * FROM prisma_contract.marker")).rows).toEqual(unknown.rows);
		await client.query("UPDATE prisma_contract.marker SET core_hash=$1 WHERE space='app'", [
			before.rows[0].core_hash,
		]);
		await client.query('ALTER TABLE "taxDefinition" ALTER COLUMN "name" DROP NOT NULL');
		expect((await run()).code).not.toBe(0);
		expect((await client.query("SELECT * FROM prisma_contract.marker")).rows).toEqual(before.rows);
		await client.query('ALTER TABLE "taxDefinition" ALTER COLUMN "name" SET NOT NULL');
		const adoption = await run();
		expect(adoption.output).not.toContain("SCHEMA_VERIFICATION_FAILED");
		expect(adoption.code).toBe(0);
		expect((await run()).code).toBe(0);
	} finally {
		await client.end();
	}
}, 240000);
