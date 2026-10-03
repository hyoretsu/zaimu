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

test("tooltip preserves cents, splits recurring flows, and omits standalone flow totals", () => {
	const html = renderToStaticMarkup(<DashboardChartTooltip active period={period} />);
	expect(html).toContain("Outubro de 2026");
	expect(html).not.toContain(">Entradas<");
	expect(html).not.toContain(">Saídas<");
	for (const label of [
		"Renda fixa",
		"Renda variável",
		"Renda",
		"Outras entradas",
		"Gastos recorrentes",
		"Outras saídas",
		"Saldo total",
	])
		expect(html).toContain(label);
	for (const value of ["135,85", "100,05", "20,20", "70,15", "20,50", "46,00", "-R$"])
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

test("subscriptions and remaining invoice have distinct colors without overlap", () => {
	const html = renderToStaticMarkup(
		<DashboardChartTooltip
			active
			period={{ ...period, cardExpenses: 30.25, recurringCardExpenses: 20.15 }}
		/>,
	);
	expect(html).toContain("Faturas");
	expect(html).toContain("#f97316");
	expect(html).toContain("Assinaturas");
	expect(html).toContain("#d946ef");
	expect(html).toContain("20,15");
	expect(html).toContain("10,10");
	expect(html).not.toContain("30,25");
	expect(html).toContain("50,00");
	expect(html).toContain("10,40");
	expect(html).not.toContain("70,15");
});
