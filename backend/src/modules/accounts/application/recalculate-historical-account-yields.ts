import { historicalYieldOverride } from "@zaimu/finance/projected-yield";
import { format, subDays } from "date-fns";
import { t } from "elysia";
import { assertFinancialAccountYieldSettings } from "~/modules/accounts/domain/assert-financial-account-yield-settings";
import type { YieldAccount } from "~/modules/accounts/domain/calculate-financial-account-yields";
import { requestHistoryCollection } from "~/modules/financial-history/application/history-collections";
import {
	enqueueAccountYieldRecalculation,
	loadYieldAccount,
} from "~/modules/reference-rates/application/reference-rate-jobs";
import { assertTaxSelection } from "~/modules/taxes/catalog";
import { HttpException } from "~/shared/errors";
import { withRawTransaction } from "~/shared/infra/sql";

export const HistoricalYieldCustomSettings = t.Object({
	yieldFixedRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
	yieldPeriod: t.Optional(t.Nullable(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]))),
	yieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
	yieldReferenceType: t.Optional(t.Nullable(t.Union([t.Literal("CDI"), t.Literal("SELIC")]))),
	yieldTaxIds: t.Optional(
		t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20, uniqueItems: true }),
	),
	yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
});
export type HistoricalYieldCustomSettings = typeof HistoricalYieldCustomSettings.static;

export function selectHistoricalYieldSettings(
	account: YieldAccount,
	today: string,
	profileId?: string | null,
	customSettings?: HistoricalYieldCustomSettings,
) {
	try {
		return historicalYieldOverride(account, profileId, today, customSettings).settings;
	} catch (error) {
		throw new HttpException(error instanceof Error ? error.message : "Regra de rendimento indisponível", 400);
	}
}

export function historicalYieldCollectionWindow(createdAt: Date, now = new Date()) {
	const startDate = format(createdAt, "yyyy-MM-dd");
	const endDate = format(subDays(now, 1), "yyyy-MM-dd");
	return startDate <= endDate ? { endDate, startDate } : null;
}

export async function recalculateHistoricalAccountYields(
	userId: string,
	accountId: string,
	profileId?: string | null,
	customSettings?: HistoricalYieldCustomSettings,
) {
	if (profileId && customSettings) throw new HttpException("Selecione apenas uma regra de rendimento", 400);
	return withRawTransaction(async query => {
		const [owned] = await query<{ id: string; institutionId: string | null }>(
			`SELECT "id", "institutionId" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 FOR UPDATE`,
			[accountId, userId],
		);
		if (!owned) throw new HttpException("Conta não encontrada", 404);
		if (profileId) {
			const [profile] = await query(
				`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "id"=$1 AND "institutionId"=$2`,
				[profileId, owned.institutionId],
			);
			if (!profile) throw new HttpException("Perfil de rendimento não encontrado", 404);
		}
		const account = await loadYieldAccount(accountId);
		if (!account) throw new HttpException("Conta não encontrada", 404);
		const now = new Date();
		const throughDate = format(now, "yyyy-MM-dd");
		if (customSettings) {
			assertFinancialAccountYieldSettings({ ...customSettings, type: account.type });
			await assertTaxSelection(customSettings.yieldTaxIds, account.yieldTaxIds ?? [], new Date());
		}
		const settings = selectHistoricalYieldSettings(account, throughDate, profileId, customSettings);
		await query(
			`UPDATE "FinancialAccount" SET "historicalYieldSettings"=$2::jsonb, "updatedAt"=NOW() WHERE "id"=$1`,
			[accountId, JSON.stringify({ settings, throughDate })],
		);
		const referenceTypes = [
			...new Set(
				"rules" in settings
					? settings.rules.flatMap(rule => (rule.yieldReferenceType ? [rule.yieldReferenceType] : []))
					: settings.yieldReferenceType
						? [settings.yieldReferenceType]
						: [],
			),
		];
		const collectionWindow = historicalYieldCollectionWindow(account.createdAt, now);
		if (referenceTypes.length && collectionWindow)
			await requestHistoryCollection("INTEREST", referenceTypes, throughDate, undefined, collectionWindow);
		await enqueueAccountYieldRecalculation(accountId, account.createdAt, `historical:${crypto.randomUUID()}`);
		return { success: true as const };
	});
}
