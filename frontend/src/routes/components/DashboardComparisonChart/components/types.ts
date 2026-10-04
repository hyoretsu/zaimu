import type { DashboardPeriod } from "@/lib/api";

export interface ChartPeriodSettings {
	endDate: string;
	periodsAfter: number;
	periodsBefore: number;
	startDate: string;
}

export type DashboardChartKind = "balances" | "flows";

export type DashboardChartPeriod = DashboardPeriod & { label: string };
