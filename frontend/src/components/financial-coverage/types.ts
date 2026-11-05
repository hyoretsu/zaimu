import type { GetFinancialHistoryCoverageResponse } from "@/lib/api";

export type CoverageItem = GetFinancialHistoryCoverageResponse["items"][number];
