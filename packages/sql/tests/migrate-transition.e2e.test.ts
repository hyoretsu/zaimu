import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import contract from "../migrations/snapshots/489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf/contract.json";
import { repairStaleIntegrityFunction } from "../scripts/historical-replay";
import { installContractFixture } from "./contract-fixture";

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

test("the lagging-database repair fixes a stale integrity function and is a no-op otherwise", async () => {
	const url = urlOf(names.empty);
	const body = async () =>
		(
			await query<{ definition: string }>(
				url,
				"SELECT pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure) AS definition",
			)
		)[0].definition;
	const healthy = await body();
	await repairStaleIntegrityFunction(url);
	expect(await body()).toBe(healthy);
	// Function bodies are stored unvalidated, so the retired table name survives until repaired.
	await query(url, healthy.replaceAll('"Recurrence"', '"Subscription"'));
	expect(await body()).toContain('"Subscription"');
	await repairStaleIntegrityFunction(url);
	expect(await body()).toBe(healthy);
}, 120000);

test("a database at a historical midpoint is repaired, replayed to head and signed natively", async () => {
	const url = urlOf(names.midpoint);
	const hash = "489fa825bbec65c03cbedcfb5f9392b3e81f364964be9deadd99a8e829aa13cf";
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await installContractFixture(client, contract);
		const historical = readFileSync(
			new URL(
				"../migrations/app/20260928T1340_activate_normalized_credit_ledger/migration.ts",
				import.meta.url,
			),
			"utf8",
		);
		const integrity = historical.match(
			/CREATE FUNCTION enforce_credit_purchase_integrity\(\)[\s\S]*?END \$integrity\$;/,
		)?.[0];
		if (!integrity) throw new Error("Historical integrity fixture missing");
		await client.query(
			integrity
				.replaceAll("subscriptionId", "recurrenceId")
				.replace(
					'(p."categoryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Category" x WHERE x."id" = p."categoryId" AND x."userId" = owner_id)) OR\n ',
					"",
				),
		);
		await client.query(
			`CREATE CONSTRAINT TRIGGER "CreditPurchaseRecord_integrity" AFTER INSERT OR UPDATE ON "CreditPurchaseRecord" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_credit_purchase_integrity();`,
		);
		await client.query(`
INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner');
INSERT INTO "FinancialAccount" ("id","userId","type") VALUES ('card-account','owner','CREDIT_CARD');
INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('card','card-account',1000,15,25);
`);
		// installContractFixture reconstructs tables only; this contract-declared check is never re-created by a later migration.
		await client.query(
			'ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_userIds_elem_not_null_ca18f62d" CHECK (array_position("userIds", NULL) IS NULL)',
		);
		await client.query(`ALTER TABLE "OutboxEvent" ALTER COLUMN "payload" SET DEFAULT '"{}"'::json`);
		// A real midpoint already has the credit views (the post-replay smoke requires one); the fixture only needs a placeholder.
		await client.query('CREATE VIEW "CreditEntry" AS SELECT 1 AS placeholder');
		await client.query("CREATE SCHEMA prisma_contract");
		await client.query(
			`CREATE TABLE prisma_contract.marker (space text DEFAULT 'app' NOT NULL PRIMARY KEY, core_hash text NOT NULL, profile_hash text NOT NULL, contract_json jsonb, canonical_version integer, updated_at timestamptz DEFAULT now() NOT NULL, app_tag text, meta jsonb DEFAULT '{}' NOT NULL, invariants text[] DEFAULT '{}' NOT NULL)`,
		);
		await client.query(
			"INSERT INTO prisma_contract.marker (space, core_hash, profile_hash) VALUES ('app', $1, $2)",
			[hash, "0".repeat(64)],
		);
	} finally {
		await client.end();
	}
	const result = await migrate(url);
	expect(result.output).not.toContain('relation "Subscription" does not exist');
	if (result.code !== 0) throw new Error(result.output.slice(-4000));
	expect(
		(await query<{ core_hash: string }>(url, "SELECT core_hash FROM prisma_contract.marker"))[0]
			.core_hash,
	).toBe(nativeHash);
	expect(await query(url, 'SELECT id FROM "CreditCard"')).toHaveLength(1);
	expect(await query(url, 'SELECT id FROM "taxDefinition"')).toHaveLength(2);
}, 480000);

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
