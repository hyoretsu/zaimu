import { getAssetQuote } from "~/modules/currencies/infra/asset-exchange";
import { queryRaw } from "~/shared/infra/sql";

let pending: Promise<void> | undefined;
let nextRefresh = 0;
/** Demand is bounded by real holdings; no speculative catalog-wide history collection. */
export function refreshHeldAssetQuotes(): Promise<void> {
	if (pending) return pending;
	if (Date.now() < nextRefresh) return Promise.resolve();
	pending = (async () => {
		const rows = await queryRaw<{ assetCode: string }>(
			`SELECT DISTINCT holding."assetCode" FROM "FinancialAccountAsset" holding JOIN "Asset" asset ON asset."code"=holding."assetCode" WHERE asset."kind"='CRYPTO' AND asset."quoteProvider" LIKE 'brapi:%' ORDER BY holding."assetCode"`,
		);
		const date = new Date().toISOString().slice(0, 10);
		for (const row of rows) {
			try {
				await getAssetQuote(date, row.assetCode, "USD");
			} catch {
				console.warn("Held asset quote remains unavailable", row.assetCode, date);
			}
		}
		nextRefresh = Date.now() + 3_600_000;
	})().finally(() => {
		pending = undefined;
	});
	return pending;
}
