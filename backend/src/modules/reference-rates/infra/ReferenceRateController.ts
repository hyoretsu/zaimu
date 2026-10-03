import Elysia, { t } from "elysia";
import { getReferenceRateAverages } from "../application/get-reference-rate-averages";

export const ReferenceRateAveragesReturn = t.Object({
	averages: t.Object({ CDI: t.Nullable(t.Number()), SELIC: t.Nullable(t.Number()) }),
	endDate: t.String(),
	ready: t.Boolean(),
	startDate: t.String(),
});
export type ReferenceRateAveragesReturn = typeof ReferenceRateAveragesReturn.static;

export const ReferenceRateController = new Elysia({ prefix: "/reference-rates" }).get(
	"/averages",
	() => getReferenceRateAverages(),
	{ detail: { tags: ["Reference rates"] }, response: ReferenceRateAveragesReturn },
);
