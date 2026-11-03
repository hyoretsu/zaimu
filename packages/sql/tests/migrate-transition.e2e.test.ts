import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";

const fixtureUrl = requireFixtureUrl("DATABASE_TEST_URL");
const base = new URL(fixtureUrl).pathname.slice(1);
const nativeHash = "7c4f89dec910830b905b2b49e39826a4b35ebebb6f01cdcd35c2b73d88e84dad";
const names = {
	empty: `${base}_tr_empty`,
	midpoint: `${base}_tr_mid`,
	stray: `${base}_tr_stray`,
	unknown: `${base}_tr_unknown`,
};
const urlOf = (name: string) => {
	const url = new URL(fixtureUrl);
	url.pathname = `/${name}`;
	return url.toString();
};
const admin = async (statement: string) => {
	const client = new Client({ connectionString: fixtureUrl });
	await client.connect();
	try {
		await client.query(statement);
	} finally {
		await client.end();
	}
};
const migrate = async (url: string) => {
	const child = Bun.spawn(["bun", join(import.meta.dir, "../scripts/migrate.ts")], {
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
const query = async <T extends object>(url: string, sql: string) => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		return (await client.query<T>(sql)).rows;
	} finally {
		await client.end();
	}
};

beforeAll(async () => {
	for (const name of Object.values(names)) await admin(`DROP DATABASE IF EXISTS "${name}"`);
	for (const name of Object.values(names)) await admin(`CREATE DATABASE "${name}"`);
}, 60000);

afterAll(async () => {
	if (process.env.KEEP_TRANSITION_DATABASES) return;
	for (const name of Object.values(names)) await admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
});

test("an empty database is built by the native baseline and a rerun changes nothing", async () => {
	const url = urlOf(names.empty);
	const first = await migrate(url);
	expect(first.code).toBe(0);
	const marker = await query<{ core_hash: string; invariants: string[] }>(
		url,
		"SELECT core_hash, invariants FROM prisma_contract.marker WHERE space='app'",
	);
	expect(marker[0].invariants).toContain("taxDefinitions.initialCatalog.v1");
	expect(await query(url, 'SELECT id FROM "taxDefinition"')).toHaveLength(2);
	const second = await migrate(url);
	expect(second.code).toBe(0);
	expect(await query(url, "SELECT core_hash FROM prisma_contract.marker WHERE space='app'")).toEqual([
		{ core_hash: marker[0].core_hash },
	]);
}, 240000);

test("a database inside the retired historical graph is refused before mutation", async () => {
	const url = urlOf(names.midpoint);
	await query(url, "CREATE SCHEMA prisma_contract");
	await query(
		url,
		"CREATE TABLE prisma_contract.marker (space text PRIMARY KEY, core_hash text, invariants text[])",
	);
	await query(
		url,
		"INSERT INTO prisma_contract.marker VALUES ('app', '489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf', '{}')",
	);
	const before = await query(url, "SELECT * FROM prisma_contract.marker");
	const result = await migrate(url);
	expect(result.code).not.toBe(0);
	expect(result.output).toContain("retired historical migration graph");
	expect(await query(url, "SELECT * FROM prisma_contract.marker")).toEqual(before);
}, 120000);

test("a database with tables but no marker is refused before mutation", async () => {
	const url = urlOf(names.stray);
	await query(url, 'CREATE TABLE "Stray" (id int)');
	const result = await migrate(url);
	expect(result.code).not.toBe(0);
	expect(result.output).toContain("no contract marker");
	expect(await query(url, "SELECT to_regclass('prisma_contract.marker')::text AS marker")).toEqual([
		{ marker: null },
	]);
}, 120000);

test("an unknown marker is refused before mutation", async () => {
	const url = urlOf(names.unknown);
	await query(url, "CREATE SCHEMA prisma_contract");
	await query(
		url,
		"CREATE TABLE prisma_contract.marker (space text PRIMARY KEY, core_hash text, invariants text[])",
	);
	await query(url, `INSERT INTO prisma_contract.marker VALUES ('app', '${"f".repeat(64)}', '{}')`);
	const before = await query(url, "SELECT * FROM prisma_contract.marker");
	const result = await migrate(url);
	expect(result.code).not.toBe(0);
	expect(result.output).toContain("Unknown database marker");
	expect(await query(url, "SELECT * FROM prisma_contract.marker")).toEqual(before);
}, 120000);
