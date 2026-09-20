import { startOfDay } from "date-fns";
import type {
	InstitutionYieldRule,
	YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { db, executeStatement, nullableNumeric, param, queryFirst } from "~/shared/infra/sql";

export async function scheduleFinancialInstitutionYieldPolicy({
	effectiveDate,
	financialInstitutionId,
	rules,
	yieldPeriod,
	yieldTaxRate,
}: {
	effectiveDate: Date;
	financialInstitutionId: string;
	rules: InstitutionYieldRule[];
	yieldPeriod?: null | YieldPeriod;
	yieldTaxRate?: null | number;
}) {
	const date = startOfDay(effectiveDate);
	await executeStatement(
		db.sql.public.FinancialInstitutionYieldPolicy.delete()
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.financialInstitutionId, financialInstitutionId),
					functions.raw`${fields.effectiveDate} > ${param(date, { codecId: "pg/date@1" })}`.returns(
						"pg/bool@1",
					),
				),
			)
			.build(),
	);
	const existing = await queryFirst(
		db.sql.public.FinancialInstitutionYieldPolicy.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.financialInstitutionId, financialInstitutionId),
					functions.eq(fields.effectiveDate, date),
				),
			)
			.limit(1)
			.build(),
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
				updatedAt: new Date(),
				yieldPeriod: yieldPeriod ?? null,
				yieldTaxRate: nullableNumeric<5, 2>(yieldTaxRate ?? null),
			})
				.where((fields, functions) => functions.eq(fields.id, policyId!))
				.build(),
		);
	} else {
		const policy = await queryFirst(
			db.sql.public.FinancialInstitutionYieldPolicy.insert([
				{
					effectiveDate: date,
					financialInstitutionId,
					yieldPeriod: yieldPeriod ?? undefined,
					yieldTaxRate:
						yieldTaxRate === null || yieldTaxRate === undefined ? undefined : String(yieldTaxRate),
				},
			])
				.returning("id")
				.build(),
		);
		policyId = policy?.id;
	}
	if (!policyId || rules.length === 0) return;
	await executeStatement(
		db.sql.public.FinancialInstitutionYieldRule.insert(
			rules.map((rule, position) => ({
				financialYieldPolicyId: policyId!,
				position,
				upToBalance:
					rule.upToBalance === null || rule.upToBalance === undefined ? undefined : String(rule.upToBalance),
				yieldFixedRate:
					rule.yieldFixedRate === null || rule.yieldFixedRate === undefined
						? undefined
						: String(rule.yieldFixedRate),
				yieldReferencePercentage:
					rule.yieldReferencePercentage === null || rule.yieldReferencePercentage === undefined
						? undefined
						: String(rule.yieldReferencePercentage),
				yieldReferenceRate:
					rule.yieldReferenceRate === null || rule.yieldReferenceRate === undefined
						? undefined
						: String(rule.yieldReferenceRate),
			})),
		).build(),
	);
}
