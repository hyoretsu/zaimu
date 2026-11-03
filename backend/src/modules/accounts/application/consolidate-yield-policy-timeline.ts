import { resolveYieldPolicyTimeline, type YieldTimelineEntry } from "../domain/resolve-yield-policy-timeline";
import type { RawQuery } from "./institution-card-rules";

interface TimelinePolicy {
	effectiveDate: Date | string;
	effectiveUntil: Date | string | null;
	id: string;
	yieldPeriod: null | string;
	yieldTaxIds: string[] | null;
	yieldTaxMode: null | string;
	yieldTaxModes: null | Record<string, string>;
	yieldTaxRate: null | number | string;
}

interface TimelineRule {
	financialYieldPolicyId: string;
	upToBalance: null | number | string;
	yieldFixedRate: null | number | string;
	yieldReferencePercentage: null | number | string;
	yieldReferenceType: null | string;
}

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const num = (value: null | number | string) => (value === null ? null : Number(value));

function signature(policy: TimelinePolicy, rules: TimelineRule[]) {
	return JSON.stringify({
		period: policy.yieldPeriod,
		rules: rules.map(rule => [
			num(rule.upToBalance),
			num(rule.yieldFixedRate),
			num(rule.yieldReferencePercentage),
			rule.yieldReferenceType,
		]),
		taxIds: [...(policy.yieldTaxIds ?? [])].sort(),
		taxMode: policy.yieldTaxMode ?? "DAILY",
		taxModes: Object.entries(policy.yieldTaxModes ?? {}).sort(([a], [b]) => a.localeCompare(b)),
		taxRate: num(policy.yieldTaxRate),
	});
}

/**
 * Keeps the yield history of one scope (institution, profile, country, currency, account type) explicit and
 * free of overlaps, resolving them in favour of `focusId`, the policy that was just saved.
 */
export async function consolidateYieldPolicyTimeline(
	query: RawQuery,
	{
		accountType = null,
		countryCode,
		currency,
		financialInstitutionId,
		focusId = null,
		profileId,
	}: {
		accountType?: null | string;
		countryCode: null | string;
		currency: null | string;
		financialInstitutionId: string;
		focusId?: null | string;
		profileId: null | string;
	},
) {
	const policies = (await query(
		`SELECT "id","effectiveDate","effectiveUntil","yieldPeriod","yieldTaxIds","yieldTaxMode","yieldTaxModes","yieldTaxRate" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1 AND "profileId" IS NOT DISTINCT FROM $2 AND "countryCode" IS NOT DISTINCT FROM $3 AND "currency" IS NOT DISTINCT FROM $4 AND "accountType" IS NOT DISTINCT FROM $5 AND "status"='APPROVED' ORDER BY "effectiveDate" ASC FOR UPDATE`,
		[financialInstitutionId, profileId, countryCode, currency, accountType],
	)) as TimelinePolicy[];
	if (policies.length === 0) return;
	const rules = (await query(
		`SELECT "financialYieldPolicyId","upToBalance","yieldFixedRate","yieldReferencePercentage","yieldReferenceType" FROM "FinancialInstitutionYieldRule" WHERE "financialYieldPolicyId" = ANY($1) ORDER BY "financialYieldPolicyId","position"`,
		[policies.map(policy => policy.id)],
	)) as TimelineRule[];
	const before: YieldTimelineEntry[] = policies.map(policy => ({
		id: policy.id,
		signature: signature(
			policy,
			rules.filter(rule => rule.financialYieldPolicyId === policy.id),
		),
		start: day(policy.effectiveDate),
		until: policy.effectiveUntil ? day(policy.effectiveUntil) : null,
	}));
	const after = resolveYieldPolicyTimeline(before, focusId, () => crypto.randomUUID());

	const kept = new Map(after.map(entry => [entry.id, entry]));
	for (const original of before) {
		const entry = kept.get(original.id);
		if (!entry) await query(`DELETE FROM "FinancialInstitutionYieldPolicy" WHERE "id"=$1`, [original.id]);
		else if (entry.start !== original.start || entry.until !== original.until)
			await query(
				`UPDATE "FinancialInstitutionYieldPolicy" SET "effectiveDate"=$2,"effectiveUntil"=$3,"updatedAt"=NOW() WHERE "id"=$1`,
				[original.id, entry.start, entry.until],
			);
	}
	for (const clone of after.filter(entry => entry.sourceId)) {
		await query(
			`INSERT INTO "FinancialInstitutionYieldPolicy" ("id","financialInstitutionId","profileId","countryCode","currency","accountType","effectiveDate","effectiveUntil","status","yieldPeriod","yieldTaxIds","yieldTaxMode","yieldTaxModes","yieldTaxRate","updatedAt") SELECT $2,"financialInstitutionId","profileId","countryCode","currency","accountType",$3,$4,"status","yieldPeriod","yieldTaxIds","yieldTaxMode","yieldTaxModes","yieldTaxRate",NOW() FROM "FinancialInstitutionYieldPolicy" WHERE "id"=$1`,
			[clone.sourceId, clone.id, clone.start, clone.until],
		);
		await query(
			`INSERT INTO "FinancialInstitutionYieldRule" ("id","financialYieldPolicyId","position","upToBalance","yieldFixedRate","yieldReferencePercentage","yieldReferenceType") SELECT gen_random_uuid()::text,$2,"position","upToBalance","yieldFixedRate","yieldReferencePercentage","yieldReferenceType" FROM "FinancialInstitutionYieldRule" WHERE "financialYieldPolicyId"=$1`,
			[clone.sourceId, clone.id],
		);
	}
}
