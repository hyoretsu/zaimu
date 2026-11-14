import { formatLocalDate } from "@/lib/date";
import { createCurrencyFormatter } from "@/lib/format-currency";

const percent = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "percent",
});

export const formatComparisonMoney = (value: number | null | undefined, currency: string) =>
	value == null ? "-" : createCurrencyFormatter(currency).format(value);
export const formatComparisonRate = (value: number | null | undefined) =>
	value == null || !Number.isFinite(value) ? "-" : percent.format(value);
export const formatComparisonDate = (value: string | null | undefined) =>
	value ? formatLocalDate(value, { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";
