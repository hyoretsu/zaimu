import { fetchCurrencyCatalog } from "@zaimu/finance/currency-provider";

let catalog: { currencies: string[]; expiresAt: number } | undefined;
let pending: Promise<string[]> | undefined;
export async function supportedCurrencies(): Promise<string[]> {
	if (catalog && catalog.expiresAt > Date.now()) return catalog.currencies;
	pending ??= fetchCurrencyCatalog()
		.then(currencies => {
			catalog = { currencies, expiresAt: Date.now() + 86_400_000 };
			return currencies;
		})
		.finally(() => {
			pending = undefined;
		});
	return pending;
}
