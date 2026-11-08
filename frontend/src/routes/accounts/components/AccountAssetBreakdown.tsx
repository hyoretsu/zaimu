import { formatAsset } from "@zaimu/finance/asset-amount";
import { useState } from "react";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import type { FinancialAccount } from "@/lib/api";
import { useCurrencyStore } from "@/stores/currency";

const COLLAPSED_ASSET_COUNT = 3;

export function AccountAssetBreakdown({ assets }: { assets: FinancialAccount["assets"] }) {
	const displayCurrency = useCurrencyStore(state => state.currency);
	const [expanded, setExpanded] = useState(false);

	if (assets.length === 0)
		return <p className="text-muted-foreground mt-2 text-sm">Nenhum ativo cadastrado</p>;
	if (assets.length === 1 && assets[0]?.assetCode === displayCurrency) return null;

	const collapsible = assets.length > COLLAPSED_ASSET_COUNT;
	const visible = collapsible && !expanded ? assets.slice(0, COLLAPSED_ASSET_COUNT) : assets;

	return (
		<>
			<ul className="mt-2 grid gap-1">
				{visible.map(asset => (
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
			{collapsible && (
				<button
					aria-expanded={expanded}
					className="text-primary mt-1 cursor-pointer text-xs font-medium hover:underline"
					onClick={() => setExpanded(open => !open)}
					type="button"
				>
					{expanded ? "Minimizar" : `Expandir (+${assets.length - COLLAPSED_ASSET_COUNT})`}
				</button>
			)}
		</>
	);
}
