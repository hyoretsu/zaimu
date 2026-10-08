export const formatCurrency = (value: number, currency = "BRL") =>
	new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(value);
