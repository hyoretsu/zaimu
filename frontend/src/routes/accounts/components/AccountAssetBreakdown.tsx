import { formatAsset } from "@zaimu/finance/asset-amount";
import { useState } from "react";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import type { FinancialAccount } from "@/lib/api";
import { useCurrencyStore } from "@/stores/currency";

const COLLAPSED_ASSET_COUNT = 3;

export function AccountAssetBreakdown({
	assets,
	currency,
}: {
	assets: FinancialAccount["assets"];
	/** The account's default currency; falls back to the user's preferred one. */
	currency?: string | null;
}) {
	const preferredCurrency = useCurrencyStore(state => state.currency);
	const displayCurrency = currency ?? preferredCurrency;
	const [expanded, setExpanded] = useState(false);

	if (assets.length === 0) return null;
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
									currency={displayCurrency}
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
