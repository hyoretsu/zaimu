import type { FinancialFee } from "@/lib/api";

export function OriginalMoneyDetails({
	originalAmount,
	currency,
	bookingCurrency,
	fees,
}: {
	originalAmount?: number | null;
	currency?: string;
	bookingCurrency: string;
	fees?: FinancialFee[];
}) {
	if (originalAmount == null || !currency) return null;
	if (currency === bookingCurrency && !fees?.some(fee => fee.amount > 0)) return null;
	const format = new Intl.NumberFormat("pt-BR", { currency, style: "currency" });
	return (
		<div className="text-muted-foreground text-xs">
			<p>Valor original: {format.format(originalAmount)}</p>
			{fees?.length ? (
				<p>
					Taxas:{" "}
					{fees
						.map(
							fee =>
								`${fee.name}: ${fee.type === "PERCENTAGE" ? `${new Intl.NumberFormat("pt-BR").format(fee.amount)}%` : format.format(fee.amount)}`,
						)
						.join(" + ")}
				</p>
			) : null}
		</div>
	);
}
