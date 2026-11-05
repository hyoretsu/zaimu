import type { GetFinancialHistoryAdminCoverageResponse } from "@/lib/api";

export type HistoryCoverage = GetFinancialHistoryAdminCoverageResponse;
export type HistoryCoverageSeries = HistoryCoverage["series"][number];
