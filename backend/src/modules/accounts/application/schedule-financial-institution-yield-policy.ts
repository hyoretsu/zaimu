import { startOfDay } from "date-fns";
import type {
	InstitutionYieldRule,
	YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { assertTaxSelection } from "~/modules/taxes/catalog";
import { db, executeStatement, nullableNumeric, queryFirst, queryRaw, queryRows } from "~/shared/infra/sql";

export async function scheduleFinancialInstitutionYieldPolicy({
	currency,
	profileId = null,
	countryCode = null,
	effectiveUntil = null,
	effectiveDate,
	financialInstitutionId,
	rules,
	yieldPeriod,
	yieldTaxIds,
	yieldTaxRate,
}: {
	currency: string;
	profileId?: string | null;
	countryCode?: string | null;
	effectiveUntil?: Date | null;
	effectiveDate: Date;
	financialInstitutionId: string;
	rules: InstitutionYieldRule[];
	yieldPeriod?: null | YieldPeriod;
	yieldTaxIds?: string[] | null;
	yieldTaxRate?: null | number;
}) {
	const current = await queryRaw<{ yieldTaxIds: string[] }>(
		`SELECT "yieldTaxIds" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1`,
		[financialInstitutionId],
	);
	await assertTaxSelection(
		yieldTaxIds,
		current.flatMap(row => row.yieldTaxIds),
		effectiveDate,
	);
	const date = startOfDay(effectiveDate);
	const [existing] = await queryRaw<{ id: string }>(
		`SELECT "id" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1 AND "effectiveDate"=$2 AND "currency"=$3 AND "profileId" IS NOT DISTINCT FROM $4 AND "countryCode" IS NOT DISTINCT FROM $5`,
		[financialInstitutionId, date, currency, profileId, countryCode],
	);
	let policyId = existing?.id;
	if (policyId) {
		await executeStatement(
			db.sql.public.FinancialInstitutionYieldRule.delete()
				.where((fields, functions) => functions.eq(fields.financialYieldPolicyId, policyId!))
				.build(),
		);
		await executeStatement(
			db.sql.public.FinancialInstitutionYieldPolicy.update({
				countryCode,
				currency,
				effectiveUntil,
				profileId,
				updatedAt: new Date(),
				yieldPeriod: yieldPeriod ?? null,
				yieldTaxIds: yieldTaxIds ?? [],
				yieldTaxRate: nullableNumeric<5, 2>(yieldTaxRate ?? null),
			})
				.where((fields, functions) => functions.eq(fields.id, policyId!))
				.build(),
		);
	} else {
		const policy = await queryFirst(
			db.sql.public.FinancialInstitutionYieldPolicy.insert([
				{
					countryCode: countryCode ?? undefined,
					currency,
					effectiveDate: date,
					effectiveUntil: effectiveUntil ?? undefined,
					financialInstitutionId,
					profileId: profileId ?? undefined,
					yieldPeriod: yieldPeriod ?? undefined,
					yieldTaxIds: yieldTaxIds ?? undefined,
					yieldTaxRate:
						yieldTaxRate === null || yieldTaxRate === undefined ? undefined : String(yieldTaxRate),
				},
			])
				.returning("id")
				.build(),
		);
		policyId = policy?.id;
	}
	if (policyId && rules.length > 0)
		await executeStatement(
			db.sql.public.FinancialInstitutionYieldRule.insert(
				rules.map((rule, position) => ({
					financialYieldPolicyId: policyId!,
					position,
					upToBalance:
						rule.upToBalance === null || rule.upToBalance === undefined
							? undefined
							: String(rule.upToBalance),
					yieldFixedRate:
						rule.yieldFixedRate === null || rule.yieldFixedRate === undefined
							? undefined
							: String(rule.yieldFixedRate),
					yieldReferencePercentage:
						rule.yieldReferencePercentage === null || rule.yieldReferencePercentage === undefined
							? undefined
							: String(rule.yieldReferencePercentage),
					yieldReferenceType: rule.yieldReferenceType ?? undefined,
				})),
			).build(),
		);
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select("id")
			.where((fields, functions) => functions.eq(fields.institutionId, financialInstitutionId))
			.build(),
	);
	for (const account of accounts)
		await enqueueAccountYieldRecalculation(account.id, date, `institution:${Date.now()}`);
}
