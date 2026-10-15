import { writeFile } from "node:fs/promises";
import { consolidateLegacyInstitution } from "~/modules/accounts/application/consolidate-legacy-institution";
import { closeDatabase, withRawTransaction } from "~/shared/infra/sql";

// Review the dry-run JSON before passing --apply. Never imports a server or starts consumers.
const apply = process.argv.includes("--apply");
const backupPath = process.argv.find(arg => arg.startsWith("--backup="))?.slice("--backup=".length);
const expectedSources = Number(
	process.argv.find(arg => arg.startsWith("--expected="))?.slice("--expected=".length),
);
try {
	await withRawTransaction(async query => {
		await query(`SET LOCAL lock_timeout='10s'`);
		await query(`SET LOCAL statement_timeout='30s'`);
		// The local-boundary rule requires explicit authorization before using --apply on a remote database.
		if (apply)
			await query(
				`LOCK TABLE "FinancialInstitution", "FinancialAccount", "UserFinancialInstitution", "UserInstitutionProfileChange", "FinancialInstitutionProposal", "FinancialInstitutionYieldPolicy", "FinancialInstitutionYieldRule" IN SHARE ROW EXCLUSIVE MODE`,
			);
		const sources = await query(
			`SELECT * FROM "FinancialInstitution" WHERE "status"='LEGACY_PRIVATE' AND "userId" IS NOT NULL ORDER BY "normalizedName","createdAt","id"`,
		);
		const globals = await query(
			`SELECT * FROM "FinancialInstitution" WHERE "status"='APPROVED' ORDER BY "id"`,
		);
		const groups = new Map<string, typeof sources>();
		for (const source of sources)
			groups.set(source.normalizedName, [...(groups.get(source.normalizedName) ?? []), source]);
		const plan = [...groups].map(([name, rows]) => {
			const targets = globals.filter(item => item.normalizedName === name);
			if (targets.length > 1) throw new Error(`Ambiguous global identity: ${name}`);
			const identities = [...rows, ...targets].map(item =>
				JSON.stringify([item.currency, [...item.operatingCountryCodes].sort()]),
			);
			if (new Set(identities).size !== 1)
				throw new Error(`Review currency/countries before consolidating ${name}`);
			return {
				name: rows[0]!.name,
				sourceIds: rows.map(item => item.id),
				targetId: targets[0]?.id as string | undefined,
			};
		});
		console.log(JSON.stringify({ apply, groups: plan, sources: sources.length }, null, 2));
		if (!apply) return;
		if (!backupPath || !Number.isInteger(expectedSources) || expectedSources !== sources.length)
			throw new Error(
				"Apply requires --backup=/absolute/path and --expected matching the reviewed dry-run count",
			);
		const [admin] = await query(`SELECT "id" FROM "user" WHERE "role"='ADMIN' ORDER BY "id"`);
		if (!admin) throw new Error("Administrative reviewer required");
		const tables = [
			"FinancialInstitution",
			"UserFinancialInstitution",
			"UserInstitutionProfileChange",
			"FinancialInstitutionProfile",
			"FinancialInstitutionYieldPolicy",
			"FinancialInstitutionYieldRule",
			"FinancialInstitutionProposal",
		];
		const backup: Record<string, unknown> = { createdAt: new Date().toISOString(), plan };
		for (const table of tables) backup[table] = await query(`SELECT * FROM "${table}" ORDER BY "id"`);
		backup.FinancialAccount = await query(
			`SELECT "id","userId","institutionId","legacyInstitutionId","updatedAt" FROM "FinancialAccount" ORDER BY "id"`,
		);
		await writeFile(backupPath, JSON.stringify(backup, null, 2), { flag: "wx", mode: 0o600 });
		const fingerprint = async () =>
			(
				await query(
					`SELECT md5(COALESCE(jsonb_agg(to_jsonb(a)-'institutionId'-'legacyInstitutionId'-'updatedAt' ORDER BY a."id")::text,'')) AS accounts FROM "FinancialAccount" a`,
				)
			)[0]!.accounts;
		const before = await fingerprint();
		const results = [];
		for (const group of plan) {
			let target = group.targetId;
			for (const id of group.sourceIds) {
				const result = await consolidateLegacyInstitution(admin.id, id, target);
				target = result.institutionId;
				results.push(result);
			}
		}
		if ((await fingerprint()) !== before) throw new Error("Account financial data changed; rolling back");
		for (const table of [
			"FinancialInstitutionYieldPolicy",
			"FinancialInstitutionYieldRule",
			"UserInstitutionProfileChange",
		]) {
			const after = await query(`SELECT * FROM "${table}" ORDER BY "id"`);
			if (JSON.stringify(after) !== JSON.stringify(backup[table]))
				throw new Error(`${table} changed; rolling back`);
		}
		const remaining = await query(
			`SELECT a."id" FROM "FinancialAccount" a JOIN "FinancialInstitution" i ON i."id"=a."institutionId" WHERE i."status"='LEGACY_PRIVATE' AND i."userId" IS NULL`,
		);
		if (remaining.length) throw new Error("Archived identities still have accounts; rolling back");
		console.log(
			JSON.stringify({ backupPath, financialDataUnchanged: true, legacyPoliciesUnchanged: true, results }),
		);
	});
	console.log(apply ? "Committed institution consolidation" : "Dry run only; no data changed");
} catch (error) {
	console.error(error instanceof Error ? error.message : "Consolidation failed");
	process.exitCode = 1;
} finally {
	await closeDatabase();
}
