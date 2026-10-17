import type { GetFinancialHistoryAdminCoverageQueryResponse } from "@/lib/api";

export type HistoryCoverage = GetFinancialHistoryAdminCoverageQueryResponse;
export type HistoryCoverageSeries = HistoryCoverage["series"][number];
