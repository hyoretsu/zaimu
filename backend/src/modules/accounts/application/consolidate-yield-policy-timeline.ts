import type { RawQuery } from "./institution-card-rules";

interface TimelinePolicy {
	effectiveDate: Date | string;
	effectiveUntil: Date | string | null;
	id: string;
	yieldPeriod: null | string;
	yieldTaxIds: string[] | null;
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
		taxRate: num(policy.yieldTaxRate),
	});
}

/**
 * Keeps the yield history of one scope (institution, profile, country, currency) explicit:
 * each approved policy is closed where the next one starts, and a policy identical to the
 * one right before it, with no gap between them, is absorbed into it.
 */
export async function consolidateYieldPolicyTimeline(
	query: RawQuery,
	{
		countryCode,
		currency,
		financialInstitutionId,
		profileId,
	}: {
		countryCode: null | string;
		currency: null | string;
		financialInstitutionId: string;
		profileId: null | string;
	},
) {
	const policies = (await query(
		`SELECT "id","effectiveDate","effectiveUntil","yieldPeriod","yieldTaxIds","yieldTaxRate" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1 AND "profileId" IS NOT DISTINCT FROM $2 AND "countryCode" IS NOT DISTINCT FROM $3 AND "currency" IS NOT DISTINCT FROM $4 AND "status"='APPROVED' ORDER BY "effectiveDate" ASC FOR UPDATE`,
		[financialInstitutionId, profileId, countryCode, currency],
	)) as TimelinePolicy[];
	if (policies.length < 2) return;
	const rules = (await query(
		`SELECT "financialYieldPolicyId","upToBalance","yieldFixedRate","yieldReferencePercentage","yieldReferenceType" FROM "FinancialInstitutionYieldRule" WHERE "financialYieldPolicyId" = ANY($1) ORDER BY "financialYieldPolicyId","position"`,
		[policies.map(policy => policy.id)],
	)) as TimelineRule[];
	const signatures = new Map(
		policies.map(policy => [
			policy.id,
			signature(
				policy,
				rules.filter(rule => rule.financialYieldPolicyId === policy.id),
			),
		]),
	);

	let current = policies[0]!;
	let currentUntil = current.effectiveUntil ? day(current.effectiveUntil) : null;
	const closings = new Map<string, null | string>();
	for (const next of policies.slice(1)) {
		const nextStart = day(next.effectiveDate);
		const contiguous = currentUntil === null || currentUntil >= nextStart;
		if (contiguous && signatures.get(current.id) === signatures.get(next.id)) {
			// The earlier policy already covers this period: absorb the later one.
			currentUntil = next.effectiveUntil ? day(next.effectiveUntil) : null;
			closings.set(current.id, currentUntil);
			await query(`DELETE FROM "FinancialInstitutionYieldPolicy" WHERE "id"=$1`, [next.id]);
			continue;
		}
		if (currentUntil === null || currentUntil > nextStart) closings.set(current.id, nextStart);
		current = next;
		currentUntil = next.effectiveUntil ? day(next.effectiveUntil) : null;
	}
	for (const [id, until] of closings)
		await query(
			`UPDATE "FinancialInstitutionYieldPolicy" SET "effectiveUntil"=$2,"updatedAt"=NOW() WHERE "id"=$1`,
			[id, until],
		);
}
