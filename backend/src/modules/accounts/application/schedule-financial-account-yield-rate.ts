import { addDays, format, startOfDay } from "date-fns";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { assertTaxSelection } from "~/modules/taxes/catalog";
import {
	db,
	executeRaw,
	executeStatement,
	nullableNumeric,
	param,
	queryFirst,
	queryRaw,
} from "~/shared/infra/sql";
import type { YieldPeriod } from "../domain/calculate-financial-account-yields";

export async function scheduleFinancialAccountYieldRate({
	effectiveDate,
	financialAccountId,
	yieldFixedRate,
	yieldPeriod,
	yieldReferencePercentage,
	yieldReferenceType,
	yieldTaxIds,
	yieldTaxRate,
}: {
	effectiveDate: Date;
	financialAccountId: string;
	yieldFixedRate?: null | number;
	yieldPeriod?: null | YieldPeriod;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: "CDI" | "SELIC" | "IPCA" | "TR" | null;
	yieldTaxIds?: string[] | null;
	yieldTaxRate?: null | number;
}) {
	const current = await queryRaw<{ yieldTaxIds: string[] }>(
		`SELECT "yieldTaxIds" FROM "FinancialAccount" WHERE "id"=$1`,
		[financialAccountId],
	);
	await assertTaxSelection(
		yieldTaxIds,
		current.flatMap(row => row.yieldTaxIds),
		effectiveDate,
	);
	const date = startOfDay(effectiveDate);
	await executeRaw(
		`UPDATE "FinancialAccount" SET "historicalYieldSettings" = jsonb_set("historicalYieldSettings"::jsonb, '{throughDate}', to_jsonb(($2::date - 1)::text)) WHERE "id" = $1 AND "historicalYieldSettings"->>'throughDate' >= $2::text`,
		[financialAccountId, format(date, "yyyy-MM-dd")],
	);
	await executeStatement(
		db.sql.public.FinancialAccountYieldRateHistory.delete()
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.financialAccountId, financialAccountId),
					functions.raw`${fields.effectiveDate} > ${param(date, { codecId: "pg/date@1" })}`.returns(
						"pg/bool@1",
					),
				),
			)
			.build(),
	);
	const existing = await queryFirst(
		db.sql.public.FinancialAccountYieldRateHistory.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.financialAccountId, financialAccountId),
					functions.eq(fields.effectiveDate, date),
				),
			)
			.limit(1)
			.build(),
	);
	const values = {
		effectiveDate: date,
		updatedAt: new Date(),
		yieldFixedRate: nullableNumeric<7, 4>(yieldFixedRate ?? null),
		yieldPeriod: yieldPeriod ?? null,
		yieldReferencePercentage: nullableNumeric<7, 4>(yieldReferencePercentage ?? null),
		yieldReferenceType: yieldReferenceType ?? null,
		yieldTaxIds: yieldTaxIds ?? [],
		yieldTaxRate: nullableNumeric<5, 2>(yieldTaxRate ?? null),
	};
	if (existing) {
		await executeStatement(
			db.sql.public.FinancialAccountYieldRateHistory.update(values)
				.where((fields, functions) => functions.eq(fields.id, existing.id))
				.build(),
		);
		await enqueueAccountYieldRecalculation(financialAccountId, date, `settings:${Date.now()}`);
		return;
	}
	await executeStatement(
		db.sql.public.FinancialAccountYieldRateHistory.insert([{ ...values, financialAccountId }]).build(),
	);
	await enqueueAccountYieldRecalculation(financialAccountId, date, `settings:${Date.now()}`);
}

export const tomorrow = () => addDays(startOfDay(new Date()), 1);
