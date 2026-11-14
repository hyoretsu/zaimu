import { installBusinessClock } from "@zaimu/finance/time-zone";
import { serveWorker } from "~/shared/infra/compute/offload";
import { getDashboardComparison } from "../../application";
import type { DashboardComparisonQuery } from "../../application/dashboard-dtos";

export interface ComparisonJob {
	businessTimestamp: string;
	currency: string;
	query: DashboardComparisonQuery;
	userId: string;
}

serveWorker(async ({ businessTimestamp, currency, query, userId }: ComparisonJob) => {
	const timestamp = new Date(businessTimestamp);
	const restore = installBusinessClock(() => timestamp);
	try {
		return await getDashboardComparison(userId, query, undefined, currency);
	} finally {
		restore();
	}
});
