import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardPeriod } from "@/lib/api";
import { DashboardChartTooltip } from "./DashboardChartTooltip";

const period: DashboardPeriod = {
	accountBalance: -10.25,
	endDate: "2026-10-31",
	endingBalance: 135.85,
	expenses: 90.65,
	fixedIncomeBalance: 100.1,
	income: 120.25,
	initialBalance: 106.25,
	net: 29.6,
	recurringExpenses: 70.15,
	recurringIncome: 100.05,
	savingsBalance: 100.1,
	startDate: "2026-10-01",
	variableIncomeBalance: 46,
};

test("tooltip preserves cents, splits recurring flows, and shows independent totals", () => {
	const html = renderToStaticMarkup(<DashboardChartTooltip active period={period} />);
	expect(html).toContain("Outubro de 2026");
	for (const label of [
		"Renda fixa",
		"Renda variável",
		"Entradas recorrentes",
		"Outras entradas",
		"Saídas recorrentes",
		"Outras saídas",
		"Saldo total",
	])
		expect(html).toContain(label);
	for (const value of ["135,85", "120,25", "100,05", "20,20", "90,65", "70,15", "20,50", "46,00", "-R$"])
		expect(html).toContain(value);
});

test("tooltip hides absent data and preserves non-month date ranges", () => {
	expect(renderToStaticMarkup(<DashboardChartTooltip period={period} />)).toBe("");
	expect(renderToStaticMarkup(<DashboardChartTooltip active />)).toBe("");
	expect(
		renderToStaticMarkup(
			<DashboardChartTooltip active period={{ ...period, endDate: "2026-10-03", startDate: "2026-10-02" }} />,
		),
	).toContain("02/10/2026 até 03/10/2026");
});
