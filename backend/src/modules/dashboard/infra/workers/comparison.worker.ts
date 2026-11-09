import { serveWorker } from "~/shared/infra/compute/offload";
import { getDashboardComparison } from "../../application";
import type { DashboardComparisonQuery } from "../../application/dashboard-dtos";

export interface ComparisonJob {
	currency: string;
	query: DashboardComparisonQuery;
	userId: string;
}

serveWorker(async ({ currency, query, userId }: ComparisonJob) =>
	getDashboardComparison(userId, query, undefined, currency),
);
