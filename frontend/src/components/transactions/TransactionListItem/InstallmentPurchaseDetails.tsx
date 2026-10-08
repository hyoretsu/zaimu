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
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	return (
		<span className="whitespace-nowrap font-semibold text-foreground text-sm">
			{installments > 1
				? `${installments}x de ${currency.format(installmentAmount)}`
				: `À vista · ${currency.format(totalAmount)}`}
		</span>
	);
}
