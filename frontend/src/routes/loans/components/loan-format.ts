import { createCurrencyFormatter } from "@/lib/format-currency";
export const formatCurrency = (value: number, currency = "BRL") =>
	createCurrencyFormatter(currency).format(value);
