export const formatCurrency = (value: number) =>
	new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
