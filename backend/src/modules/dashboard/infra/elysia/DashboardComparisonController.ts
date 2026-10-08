import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { defaultCurrency } from "~/modules/currencies/application/currency-defaults";
import { getDashboardComparison } from "~/modules/dashboard/application";
import { DashboardComparisonQuery, PeriodReturn } from "~/modules/dashboard/application/dashboard-dtos";
import { distributedCache } from "~/shared/infra/cache";

export const DashboardComparisonReturn = t.Array(PeriodReturn);
export type DashboardComparisonReturn = typeof DashboardComparisonReturn.static;

export const DashboardComparisonController = new Elysia().get(
	"/comparison",
	async ({ query, request, set, status }) => {
		const userId = await requireUserId(request);
		const currency = await defaultCurrency(userId, request.headers.get("X-Currency"));
		const cached = await distributedCache.remember(
			userId,
			"dashboard",
			{ resource: "comparison", ...query, currency },
			(): Promise<DashboardComparisonReturn> => getDashboardComparison(userId, query, undefined, currency),
		);
		set.headers.etag = cached.etag;
		set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
		if (request.headers.get("if-none-match") === cached.etag) return status(304, null);
		return cached.value;
	},
	{
		detail: { tags: ["Dashboard"] },
		query: DashboardComparisonQuery,
		response: { 200: DashboardComparisonReturn, 304: t.Null() },
	},
);
