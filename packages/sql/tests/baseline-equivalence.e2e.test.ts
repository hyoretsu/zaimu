import { afterAll, beforeAll, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import { replayHistoricalGraph } from "../scripts/historical-replay";

const root = resolve(import.meta.dir, "..");
const cli = join(dirname(createRequire(import.meta.url).resolve("prisma/package.json")), "dist/prisma.js");
const fixtureUrl = requireFixtureUrl("DATABASE_TEST_URL");
const withDatabase = (name: string) => {
	const url = new URL(fixtureUrl);
	url.pathname = `/${name}`;
	return url.toString();
};
const base = new URL(fixtureUrl).pathname.slice(1);
const replayName = `${base}_replay`;
const nativeName = `${base}_native`;
const replayUrl = withDatabase(replayName);
const nativeUrl = withDatabase(nativeName);

// Known intended differences, listed here and nowhere else:
// - the marker hash (historical head versus native baseline) is not compared;
// - OutboxEvent bootstrap rows get random ids and timestamps at creation;
// - Postgres deparses equivalent CHECK expressions with different parentheses and casts;
// - column order inside a table follows the history of ALTER TABLE and is not semantic.
const volatileColumns: Record<string, string[]> = {
	OutboxEvent: ["id", "correlationId", "createdAt", "occurredAt", "updatedAt"],
};
const normalizeCheck = (definition: string) =>
	definition
		.replace(/\s/g, "")
		.replace(/::(text|charactervarying)(\[\])?/g, "")
		.replace(/[()]/g, "");

const catalogs: Record<string, string> = {
	columns: `SELECT table_name||'.'||column_name||' '||data_type||' default '||coalesce(column_default,'-')||' null '||is_nullable||' len '||coalesce(character_maximum_length::text,'-')||' prec '||coalesce(numeric_precision::text,'-')||'/'||coalesce(numeric_scale::text,'-') AS item FROM information_schema.columns WHERE table_schema='public'`,
	enums: `SELECT t.typname||' '||string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) AS item FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid GROUP BY t.typname`,
	extensions: `SELECT extname||' '||extversion AS item FROM pg_extension WHERE extname <> 'plpgsql'`,
	functions: `SELECT p.oid::regprocedure::text||' '||md5(pg_get_functiondef(p.oid)) AS item FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')`,
	indexes: `SELECT indexdef AS item FROM pg_indexes WHERE schemaname='public'`,
	otherConstraints: `SELECT conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) AS item FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype <> 'c'`,
	sequences: `SELECT schemaname||'.'||sequencename||' '||start_value AS item FROM pg_sequences`,
	triggers: `SELECT c.relname||' '||t.tgname||' '||pg_get_triggerdef(t.oid) AS item FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal`,
	views: `SELECT c.relname||' '||md5(pg_get_viewdef(c.oid)) AS item FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='v'`,
};

async function fingerprint(url: string) {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		const result: Record<string, string[]> = {};
		for (const [name, sql] of Object.entries(catalogs))
			result[name] = (await client.query<{ item: string }>(sql)).rows.map(row => row.item).sort();
		result.checks = (
			await client.query<{ item: string }>(
				`SELECT conrelid::regclass||' '||conname AS item, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c'`,
			)
		).rows
			.map(row => `${row.item} ${normalizeCheck((row as unknown as { def: string }).def)}`)
			.sort();
		const tables = (
			await client.query<{ table_name: string }>(
				"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
			)
		).rows.map(row => row.table_name);
		for (const table of tables.sort()) {
			const columns = (
				await client.query<{ column_name: string }>(
					"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY column_name",
					[table],
				)
			).rows
				.map(row => row.column_name)
				.filter(column => !volatileColumns[table]?.includes(column));
			const select = columns.map(column => `"${column}"`).join(",");
			const rows = await client.query<{ row: string }>(
				`SELECT row_to_json(t)::text AS row FROM (SELECT ${select} FROM public."${table}") t`,
			);
			result[`data:${table}`] = rows.rows.map(row => row.row).sort();
		}
		result.invariants = (
			await client.query<{ invariants: string[] }>("SELECT invariants FROM prisma_contract.marker")
		).rows[0].invariants.sort();
		return result;
	} finally {
		await client.end();
	}
}

function differences(left: Record<string, string[]>, right: Record<string, string[]>) {
	const found: string[] = [];
	for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
		const a = new Set(left[key] ?? []);
		const b = new Set(right[key] ?? []);
		for (const item of a) if (!b.has(item)) found.push(`${key}: only in native: ${item.slice(0, 120)}`);
		for (const item of b) if (!a.has(item)) found.push(`${key}: only in replay: ${item.slice(0, 120)}`);
	}
	return found;
}

async function createDatabase(name: string) {
	const admin = new Client({ connectionString: fixtureUrl });
	await admin.connect();
	try {
		await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
		await admin.query(`CREATE DATABASE "${name}"`);
	} finally {
		await admin.end();
	}
}

async function dropDatabase(name: string) {
	const admin = new Client({ connectionString: fixtureUrl });
	await admin.connect();
	try {
		await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	} finally {
		await admin.end();
	}
}

let replay: Record<string, string[]>;

beforeAll(async () => {
	await Promise.all([createDatabase(replayName), createDatabase(nativeName)]);
	const child = Bun.spawn(["bun", cli, "db", "migrate", "--db", nativeUrl], {
		cwd: root,
		env: { ...process.env, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
		stderr: "pipe",
		stdout: "pipe",
	});
	const [code, output] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (code !== 0) throw new Error(`Native baseline failed: ${output}`);
	await replayHistoricalGraph(root, replayUrl);
	replay = await fingerprint(replayUrl);
}, 480000);

afterAll(async () => {
	await Promise.all([dropDatabase(replayName), dropDatabase(nativeName)]);
});

test("native baseline is equivalent to a full historical replay", async () => {
	expect(replay.views.length).toBe(3);
	expect(replay["data:taxDefinitionVersion"].length).toBe(2);
	expect(replay.invariants.length).toBe(7);
	expect(differences(await fingerprint(nativeUrl), replay)).toEqual([]);
}, 120000);

const mutations: Record<string, string> = {
	check: 'ALTER TABLE "AccountTransfer" DROP CONSTRAINT "AccountTransfer_distinct_users"',
	extension: "DROP EXTENSION unaccent CASCADE",
	function: "DROP FUNCTION public.credit_cycle_date(date,integer,integer) CASCADE",
	index: 'DROP INDEX "Transaction_description_search_idx"',
	invariant: "UPDATE prisma_contract.marker SET invariants = '{}'",
	seed: 'DELETE FROM "OutboxEvent"',
	seedTax: 'DELETE FROM "taxDefinitionVersion"',
	trigger: 'DROP TRIGGER "FinancialInstitution_refund_policy" ON "FinancialInstitution"',
	view: 'DROP VIEW "CreditConsumption"',
};

for (const [name, statement] of Object.entries(mutations))
	test(`removing a single ${name} from the baseline is detected`, async () => {
		const client = new Client({ connectionString: nativeUrl });
		await client.connect();
		try {
			await client.query("BEGIN");
			await client.query(statement);
			await client.query("COMMIT");
		} finally {
			await client.end();
		}
		expect(differences(await fingerprint(nativeUrl), replay).length).toBeGreaterThan(0);
		// Restore the native database for the following mutation checks.
		await dropDatabase(nativeName);
		await createDatabase(nativeName);
		const child = Bun.spawn(["bun", cli, "db", "migrate", "--db", nativeUrl], {
			cwd: root,
			env: { ...process.env, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
			stderr: "ignore",
			stdout: "ignore",
		});
		expect(await child.exited).toBe(0);
	}, 180000);
