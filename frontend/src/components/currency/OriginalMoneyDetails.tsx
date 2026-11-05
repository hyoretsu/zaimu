import { formatAsset } from "@zaimu/finance/asset-amount";
import type { FinancialFee } from "@/lib/api";

export function OriginalMoneyDetails({
	originalAmount,
	currency,
	bookingCurrency,
	fees,
}: {
	originalAmount?: number | string | null;
	currency?: string;
	bookingCurrency: string;
	fees?: FinancialFee[];
}) {
	if (originalAmount == null || !currency) return null;
	if (currency === bookingCurrency && !fees?.some(fee => /[1-9]/.test(String(fee.amount)))) return null;
	const format = (value: number | string, asset = currency) => formatAsset(value, asset);
	return (
		<div className="text-muted-foreground text-xs">
			<p>Valor original: {format(originalAmount)}</p>
			{fees?.length ? (
				<p>
					Taxas:{" "}
					{fees
						.map(
							fee =>
								`${fee.name}: ${fee.type === "PERCENTAGE" ? `${new Intl.NumberFormat("pt-BR").format(Number(fee.amount))}%` : format(fee.amount, fee.assetCode ?? currency)}`,
						)
						.join(" + ")}
				</p>
			) : null}
		</div>
	);
}
