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

test("tooltip preserves cents, splits recurring flows, and groups totals and their component values", () => {
	const html = renderToStaticMarkup(<DashboardChartTooltip active period={period} />);
	expect(html).toContain("Outubro de 2026");
	expect(html).toContain(">Entradas<");
	expect(html).toContain(">Saídas<");
	for (const label of [
		"Renda fixa",
		"Renda variável",
		"Renda",
		"Outras entradas",
		"Gastos recorrentes",
		"Outras saídas",
		"Investido",
		"Patrimônio",
	])
		expect(html).toContain(label);
	for (const value of [
		"135,85",
		"146,10",
		"120,25",
		"90,65",
		"100,05",
		"20,20",
		"70,15",
		"20,50",
		"46,00",
		"-R$",
	])
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

test("invoice total includes nested subscriptions and other card expenses", () => {
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
	expect(html).toContain("30,25");
	expect(html).toContain("Outras compras");
	expect(html.indexOf(">Faturas<")).toBeLessThan(html.indexOf(">Assinaturas<"));
	expect(html).toContain("pl-6");
	expect(html).toContain("50,00");
	expect(html).toContain("10,40");
	expect(html).not.toContain("70,15");
});

test("balance tooltip shows only wealth while flow tooltip shows only income and expenses", () => {
	const balances = renderToStaticMarkup(<DashboardChartTooltip active kind="balances" period={period} />);
	expect(balances).toContain("Patrimônio");
	expect(balances).toContain("Investido");
	expect(balances).not.toContain("Saldo total");
	expect(balances).toContain("Renda fixa");
	expect(balances).not.toContain(">Entradas<");
	expect(balances).not.toContain(">Saídas<");
	const flows = renderToStaticMarkup(<DashboardChartTooltip active kind="flows" period={period} />);
	expect(flows).toContain(">Entradas<");
	expect(flows).toContain(">Saídas<");
	expect(flows).not.toContain("Patrimônio");
	expect(flows).not.toContain("Investido");
	expect(flows).not.toContain("Renda fixa");
	expect(flows).toContain("90,65");
});

test("tooltip respects zero and three decimal currency precision", () => {
	const yen = renderToStaticMarkup(
		<DashboardChartTooltip active currencyCode="JPY" period={{ ...period, endingBalance: 1234.56 }} />,
	);
	const dinar = renderToStaticMarkup(
		<DashboardChartTooltip active currencyCode="KWD" period={{ ...period, endingBalance: 1.234 }} />,
	);
	expect(yen).toContain("1.235");
	expect(yen).not.toContain("1.234,56");
	expect(dinar).toContain("1,234");
});
