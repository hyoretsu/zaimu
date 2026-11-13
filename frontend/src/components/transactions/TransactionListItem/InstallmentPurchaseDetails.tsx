import { createCurrencyFormatter } from "@/lib/format-currency";
export function InstallmentPurchaseDetails({
	currencyCode,
	installmentAmount,
	installments,
	totalAmount,
}: {
	currencyCode: string;
	installmentAmount: number;
	installments: number;
	totalAmount: number;
}) {
	const currency = createCurrencyFormatter(currencyCode);
	return (
		<span className="text-foreground text-sm font-semibold whitespace-nowrap">
			{installments > 1
				? `${installments}x de ${currency.format(installmentAmount)}`
				: currency.format(totalAmount)}
		</span>
	);
}
