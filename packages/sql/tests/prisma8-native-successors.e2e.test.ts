import { expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";

const root = join(import.meta.dir, "..");
const url = requireFixtureUrl("DATABASE_TEST_URL");

test("production wrapper continues through two officially planned native successors", async () => {
	const copy = await mkdtemp(join(tmpdir(), "zaimu-native-successors-"));
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		for (const name of [
			"scripts",
			"src",
			"out",
			"compatibility",
			"migrations",
			"migrations-native",
			"prisma.config.ts",
		])
			await cp(join(root, name), join(copy, name), {
				filter: source => !source.includes("node_modules"),
				recursive: true,
			});
		await symlink(join(root, "../../node_modules"), join(copy, "node_modules"), "dir");
		await symlink(
			join(root, "compatibility/early-rc/node_modules"),
			join(copy, "compatibility/early-rc/node_modules"),
			"dir",
		);
		const cli = join(root, "../../node_modules/prisma/dist/prisma.js");
		const run = async (args: string[]) => {
			const child = Bun.spawn(["bun", ...args], {
				cwd: copy,
				env: { ...process.env, DATABASE_URL: url, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
				stderr: "pipe",
				stdout: "pipe",
			});
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			if (code !== 0) throw new Error(`${args.join(" ")} failed: ${stdout}${stderr}`);
			return stdout + stderr;
		};
		const id = crypto.randomUUID();
		await client.query(
			'INSERT INTO "user" (id,name,email,"createdAt","updatedAt") VALUES ($1,$2,$3,NOW(),NOW())',
			[id, "native preserved", `${id}@example.test`],
		);
		const source = join(copy, "src/prisma/contract.prisma");
		let origin = "0910b74d970a439b82b4439747f1beb173ec250413d41fc5029ec1c3ddde9b29";
		for (const field of ["nativeProbeOne", "nativeProbeTwo"]) {
			const original = await readFile(source, "utf8");
			await writeFile(
				source,
				original.replace("model User {", `model User {\n    ${field} VarChar(32)?`),
			);
			await run([cli, "contract", "emit"]);
			await run([cli, "migration", "plan", "--name", field, "--from", origin]);
			origin = (await Bun.file(join(copy, "out/prisma/contract.json")).json()).storage.storageHash;
			const output = await run([join(copy, "scripts/migrate.ts")]);
			expect(output).not.toContain("Create table");
			expect((await client.query('SELECT name FROM "user" WHERE id=$1', [id])).rows[0].name).toBe(
				"native preserved",
			);
		}
		await run([join(copy, "scripts/migrate.ts")]);
		// This database belongs exclusively to the runner: rebuild an actual old
		// state through immutable replay, never manufacture a historical marker.
		await client.query(
			"DROP SCHEMA public CASCADE; DROP SCHEMA prisma_contract CASCADE; CREATE SCHEMA public",
		);
		await run([
			"-e",
			`import { replayHistoricalGraph } from ${JSON.stringify(join(copy, "scripts/historical-replay.ts"))}; await replayHistoricalGraph(${JSON.stringify(copy)}, process.env.DATABASE_URL);`,
		]);
		await client.query(
			'INSERT INTO "user" (id,name,email,"createdAt","updatedAt") VALUES ($1,$2,$3,NOW(),NOW())',
			[id, "native preserved", `${id}@example.test`],
		);
		await run([join(copy, "scripts/migrate.ts")]);
		expect((await client.query('SELECT name FROM "user" WHERE id=$1', [id])).rows[0].name).toBe(
			"native preserved",
		);
		expect(
			(
				await client.query(
					"SELECT count(*)::int AS count FROM prisma_contract.ledger WHERE migration_name LIKE '%native_format_baseline%'",
				)
			).rows[0].count,
		).toBe(0);
		expect(
			(await client.query('SELECT "nativeProbeOne","nativeProbeTwo" FROM "user" WHERE id=$1', [id]))
				.rows[0],
		).toEqual({ nativeProbeOne: null, nativeProbeTwo: null });
	} finally {
		await client.end();
		await rm(copy, { force: true, recursive: true });
	}
}, 300000);
