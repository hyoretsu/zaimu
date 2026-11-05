import { format, startOfDay } from "date-fns";
import type {
	InstitutionYieldRule,
	YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { assertTaxSelection } from "~/modules/taxes/catalog";
import { db, executeStatement, nullableNumeric, queryFirst, queryRows } from "~/shared/infra/sql";

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
	yieldTaxMode,
	yieldTaxModes,
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
	yieldTaxMode?: null | string;
	yieldTaxModes?: unknown;
}) {
	const current = await queryRows(
		db.sql.public.FinancialInstitutionYieldPolicy.select("yieldTaxIds")
			.where((f, fn) => fn.eq(f.financialInstitutionId, financialInstitutionId))
			.build(),
	);
	await assertTaxSelection(
		yieldTaxIds,
		current.flatMap(row => row.yieldTaxIds),
		effectiveDate,
	);
	const date = startOfDay(effectiveDate);
	const [existing] = await queryRows(
		db.sql.public.FinancialInstitutionYieldPolicy.select("id")
			.where((f, fn) =>
				fn.and(
					fn.eq(f.financialInstitutionId, financialInstitutionId),
					fn.eq(f.effectiveDate, format(date, "yyyy-MM-dd")),
					fn.eq(f.currency, currency),
					profileId === null
						? fn.raw`${f.profileId} IS NULL`.returns("pg/bool@1")
						: fn.eq(f.profileId, profileId),
					countryCode === null
						? fn.raw`${f.countryCode} IS NULL`.returns("pg/bool@1")
						: fn.eq(f.countryCode, countryCode),
				),
			)
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
				countryCode,
				currency,
				effectiveUntil: effectiveUntil === null ? null : format(effectiveUntil, "yyyy-MM-dd"),
				profileId,
				updatedAt: new Date(),
				yieldPeriod: yieldPeriod ?? null,
				yieldTaxIds: yieldTaxIds ?? [],
				yieldTaxMode: (yieldTaxMode ?? "DAILY") as "DAILY" | "ON_REDEMPTION",
				yieldTaxModes: (yieldTaxModes ?? null) as never,
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
					effectiveDate: format(date, "yyyy-MM-dd"),
					effectiveUntil: effectiveUntil == null ? undefined : format(effectiveUntil, "yyyy-MM-dd"),
					financialInstitutionId,
					profileId: profileId ?? undefined,
					yieldPeriod: yieldPeriod ?? undefined,
					yieldTaxIds: yieldTaxIds ?? [],
					yieldTaxMode: (yieldTaxMode ?? "DAILY") as "DAILY" | "ON_REDEMPTION",
					yieldTaxModes: (yieldTaxModes ?? null) as never,
					yieldTaxRate:
						yieldTaxRate === null || yieldTaxRate === undefined
							? undefined
							: String(yieldTaxRate),
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
