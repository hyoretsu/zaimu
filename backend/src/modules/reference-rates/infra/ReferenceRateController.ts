import { financialIndicators } from "@zaimu/finance/financial-indicators";
import Elysia, { t } from "elysia";
import { HistoryProgressReturn } from "~/modules/financial-history/infra/FinancialHistoryController";
import { financialIndicatorContext } from "../application/financial-indicators";
import { getReferenceRateAverages } from "../application/get-reference-rate-averages";

export const ReferenceRateAveragesReturn = t.Object({
	averages: t.Object({
		CDI: t.Nullable(t.Number()),
		IPCA: t.Optional(t.Nullable(t.Number())),
		SELIC: t.Nullable(t.Number()),
		TR: t.Optional(t.Nullable(t.Number())),
	}),
	collectionId: t.Nullable(t.String()),
	endDate: t.String(),
	progress: t.Nullable(HistoryProgressReturn),
	ready: t.Boolean(),
	startDate: t.String(),
});
export type ReferenceRateAveragesReturn = typeof ReferenceRateAveragesReturn.static;

export const ReferenceRateController = new Elysia({ prefix: "/reference-rates" })
	.get(
		"/indicators",
		async () => {
			const context = await financialIndicatorContext(new Date().toISOString().slice(0, 10));
			return {
				catalog: financialIndicators,
				observations: context.observations,
				projections: context.projections,
			};
		},
		{ response: t.Object({ catalog: t.Unknown(), observations: t.Unknown(), projections: t.Unknown() }) },
	)
	.get("/averages", () => getReferenceRateAverages(), {
		detail: { operationId: "getReferenceRatesAverages", tags: ["Reference rates"] },
		response: ReferenceRateAveragesReturn,
	});
