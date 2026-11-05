// Read-only: lists the custom objects and seeded rows a historically replayed database has and the
// generated native baseline lacks. Usage: bun scripts/inventory-baseline-gap.ts <replayedUrl> <baselineUrl>
import { Client } from "pg";

const [replayUrl, baselineUrl] = process.argv.slice(2);
if (!replayUrl || !baselineUrl)
	throw new Error("Usage: inventory-baseline-gap.ts <replayedUrl> <baselineUrl>");

const catalogs = {
	extensions: "SELECT extname AS name FROM pg_extension WHERE extname <> 'plpgsql'",
	functions: `SELECT p.oid::regprocedure::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
		WHERE n.nspname IN ('public','prisma_contract') AND p.prokind='f'`,
	triggers: `SELECT t.tgname||' ON '||c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
		WHERE NOT t.tgisinternal`,
	views: "SELECT schemaname||'.'||viewname AS name FROM pg_views WHERE schemaname IN ('public','prisma_contract')",
};

const names = async (url: string, sql: string) => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		return new Set((await client.query<{ name: string }>(sql)).rows.map(row => row.name));
	} finally {
		await client.end();
	}
};

for (const [kind, sql] of Object.entries(catalogs)) {
	const [replay, baseline] = await Promise.all([names(replayUrl, sql), names(baselineUrl, sql)]);
	const missing = [...replay].filter(name => !baseline.has(name)).sort();
	console.log(`${kind}: replay=${replay.size} baseline=${baseline.size} missing=${missing.length}`);
	for (const name of missing) console.log(`  - ${name}`);
}

const client = new Client({ connectionString: replayUrl });
await client.connect();
try {
	const seeded = await client.query<{ relname: string; rows: string }>(
		`SELECT relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, relname), false, true, '')))[1]::text AS rows
		 FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname`,
	);
	console.log("seeded tables:");
	for (const row of seeded.rows) if (Number(row.rows) > 0) console.log(`  - ${row.relname}: ${row.rows}`);
	const stale = await client.query<{ stale: boolean }>(
		`SELECT pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure) LIKE '%"Subscription"%' AS stale`,
	);
	console.log(`enforce_credit_purchase_integrity mentions "Subscription": ${stale.rows[0].stale}`);
} finally {
	await client.end();
}
