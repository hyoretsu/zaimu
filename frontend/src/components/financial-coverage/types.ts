import type { GetFinancialHistoryCoverageQueryResponse } from "@/lib/api";

export type CoverageItem = GetFinancialHistoryCoverageQueryResponse["items"][number];
