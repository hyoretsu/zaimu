import { formatAsset } from "@zaimu/finance/asset-amount";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import type { FinancialAccount } from "@/lib/api";
import { useCurrencyStore } from "@/stores/currency";

export function AccountAssetBreakdown({ assets }: { assets: FinancialAccount["assets"] }) {
	const displayCurrency = useCurrencyStore(state => state.currency);

	if (assets.length === 0)
		return <p className="text-muted-foreground mt-2 text-sm">Nenhum ativo cadastrado</p>;
	if (assets.length === 1 && assets[0]?.assetCode === displayCurrency) return null;

	return (
		<ul className="mt-2 grid gap-1">
			{assets.map(asset => (
				<li className="flex items-baseline justify-between gap-3 text-sm" key={asset.assetCode}>
					<span
						className={`min-w-0 break-words ${asset.balance.startsWith("-") ? "text-destructive" : "text-muted-foreground"}`}
					>
						{formatAsset(asset.balance, asset.assetCode)}
					</span>
					{asset.assetCode !== displayCurrency && (
						<span className="text-muted-foreground shrink-0 text-xs">
							≈{" "}
							<PreferredMoneyAmount
								values={[{ amount: asset.balance, currency: asset.assetCode }]}
							/>
						</span>
					)}
				</li>
			))}
		</ul>
	);
}
