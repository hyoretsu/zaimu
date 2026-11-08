import { addDays, format, startOfDay } from "date-fns";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { assertTaxSelection } from "~/modules/taxes/catalog";
import { HttpException } from "~/shared/errors";
import {
	db,
	executeRaw,
	executeStatement,
	nullableNumeric,
	param,
	queryFirst,
	queryRows,
} from "~/shared/infra/sql";
import type { YieldPeriod } from "../domain/calculate-financial-account-yields";
import { assertFiatHolding } from "./account-assets";

export async function scheduleFinancialAccountYieldRate({
	effectiveDate,
	financialAccountId,
	yieldFixedRate,
	yieldPeriod,
	yieldReferencePercentage,
	yieldReferenceType,
	yieldTaxIds,
	yieldTaxMode,
	yieldTaxModes,
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
	yieldTaxMode?: null | string;
	yieldTaxModes?: unknown;
}) {
	const current = await queryRows(
		db.sql.public.FinancialAccount.select("yieldTaxIds", "yieldCurrency")
			.where((f, fn) => fn.eq(f.id, financialAccountId))
			.build(),
	);
	const currency = current[0]?.yieldCurrency;
	if (!currency) throw new HttpException("Selecione um ativo fiat para o rendimento da conta", 400);
	await assertFiatHolding(financialAccountId, currency);
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
					functions.raw`${fields.effectiveDate} > ${param(format(date, "yyyy-MM-dd"), { codecId: "pg/date-string@1" })}`.returns(
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
					functions.eq(fields.effectiveDate, format(date, "yyyy-MM-dd")),
				),
			)
			.limit(1)
			.build(),
	);
	const values = {
		currency,
		effectiveDate: format(date, "yyyy-MM-dd"),
		updatedAt: new Date(),
		yieldFixedRate: nullableNumeric<7, 4>(yieldFixedRate ?? null),
		yieldPeriod: yieldPeriod ?? null,
		yieldReferencePercentage: nullableNumeric<7, 4>(yieldReferencePercentage ?? null),
		yieldReferenceType: yieldReferenceType ?? null,
		yieldTaxIds: yieldTaxIds ?? [],
		yieldTaxMode: (yieldTaxMode ?? "DAILY") as "DAILY" | "ON_REDEMPTION",
		yieldTaxModes: (yieldTaxModes ?? null) as never,
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
