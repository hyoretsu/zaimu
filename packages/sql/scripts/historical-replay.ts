import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

export const historicalHead = "5f6b4cd90770cc8d161af5e9a6dec4e91e58593d2bb41e6abed6efc78ff6c2c7";

export async function isHistoricalAncestor(root: string, hash: string) {
	return isGraphAncestor(join(root, "migrations/app"), hash, historicalHead);
}

export async function isGraphAncestor(directory: string, hash: string, target: string) {
	if (!/^[a-f0-9]{64}$/.test(hash)) return false;
	const edges = new Map<string, string[]>();
	const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
		if (error.code === "ENOENT") return [];
		throw error;
	});
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "refs") continue;
		const manifest = await Bun.file(join(directory, entry.name, "migration.json")).json();
		const targets = edges.get(manifest.from) ?? [];
		targets.push(manifest.to);
		edges.set(manifest.from, targets);
	}
	const seen = new Set<string>();
	const pending = [hash];
	while (pending.length) {
		const node = pending.pop()!;
		if (node === target) return true;
		if (seen.has(node)) continue;
		seen.add(node);
		pending.push(...(edges.get(node) ?? []));
	}
	return false;
}

/** Explicit migration action only; no dependency installation, application imports or source mutation. */
export async function replayHistoricalGraph(root: string, url: string) {
	const historical = join(root, "compatibility/early-rc");
	const modules = join(historical, "node_modules");
	if (!(await Bun.file(join(modules, "@prisma/cli/dist/cli.js")).exists()))
		throw new Error("Run setup:historical-sql before deploying historical migrations");
	const temporary = await mkdtemp(join(tmpdir(), "zaimu-historical-replay-"));
	try {
		await cp(join(root, "migrations"), join(temporary, "migrations"), { recursive: true });
		await cp(join(historical, "prisma.config.ts"), join(temporary, "prisma.config.ts"));
		await symlink(modules, join(temporary, "node_modules"), "dir");
		await mkdir(join(temporary, "src/prisma"), { recursive: true });
		await writeFile(
			join(temporary, "src/prisma/contract.prisma"),
			"// Historical contract resolved from immutable snapshots.\n",
		);
		await mkdir(join(temporary, "out/prisma"), { recursive: true });
		for (const name of ["contract.json", "contract.d.ts"])
			await cp(
				join(root, "migrations/snapshots", historicalHead, name),
				join(temporary, "out/prisma", name),
			);
		const invariants = new Set<string>();
		for (const entry of await readdir(join(root, "migrations/app"), { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === "refs") continue;
			const manifest = await Bun.file(
				join(root, "migrations/app", entry.name, "migration.json"),
			).json();
			for (const invariant of manifest.providedInvariants ?? []) invariants.add(invariant);
		}
		await writeFile(
			join(temporary, "migrations/app/refs/replay.json"),
			JSON.stringify({ hash: historicalHead, invariants: [...invariants].sort() }),
		);
		const child = Bun.spawn(
			["bun", join(modules, "@prisma/cli/dist/cli.js"), "migrate", "--to", "replay"],
			{
				cwd: temporary,
				env: { ...process.env, DATABASE_URL: url, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
				stderr: "inherit",
				stdout: "inherit",
			},
		);
		if (await child.exited)
			throw new Error("Historical graph replay failed; latest marker was not adopted");
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			const marker = await client.query<{ core_hash: string; invariants: string[] }>(
				"SELECT core_hash,invariants FROM prisma_contract.marker WHERE space='app'",
			);
			if (
				marker.rows[0]?.core_hash !== historicalHead ||
				[...invariants].some(value => !marker.rows[0].invariants.includes(value))
			)
				throw new Error("Historical head/data invariants not satisfied; latest adoption refused");
			const smoke = await client.query<{ valid: boolean }>(`SELECT
					(SELECT count(*) = 2 FROM "taxDefinition" d JOIN "taxDefinitionVersion" v ON v."taxDefinitionId"=d.id WHERE (d.id,v.id) IN (('iof','iof-initial'),('ir','ir-initial')))
					AND NOT EXISTS (SELECT 1 FROM "FinancialInstitution" i WHERE i."userId" IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM "FinancialInstitutionProfile" p WHERE p."institutionId"=i.id AND p."isDefault") OR NOT EXISTS (SELECT 1 FROM "UserFinancialInstitution" l WHERE l."institutionId"=i.id AND l."userId"=i."userId")))
					AND NOT EXISTS (SELECT 1 FROM "FinancialAccount" WHERE "legacyYieldCalendar" IS NOT NULL AND ("legacyYieldCalendar"::jsonb->>'throughDate' IS NULL OR jsonb_typeof("legacyYieldCalendar"::jsonb->'holidays') <> 'array'))
					AND NOT EXISTS (SELECT 1 FROM "FinancialInstitution" WHERE lower(name)='nubank' AND NOT ("creditCardRules"::jsonb ?& ARRAY['cashback','workingDueDate','transitionMode','installmentMode']))
					AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname='MonthlyBudget_values_check' AND pg_get_constraintdef(oid) LIKE '%UNCATEGORIZED%')
					AND position('Refunds exceed purchase total' in pg_get_functiondef('public.enforce_credit_purchase_integrity()'::regprocedure))=0
					AND EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public') AS valid`);
			if (!smoke.rows[0]?.valid)
				throw new Error("Historical custom-object/data smoke failed; adoption refused");
		} finally {
			await client.end();
		}
	} finally {
		await rm(temporary, { force: true, recursive: true });
	}
}
