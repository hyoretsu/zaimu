import initialCatalog from "./coinbase-crypto-catalog.json";
import { currencyDigits, normalizeCurrency, registerAssetDecimals } from "./money";

export interface CryptoAsset {
	code: string;
	symbol: string;
	name: string;
	/** Accounting precision, independent of the provider's display exponent. */
	digits: number;
	nativeDigits: number;
	provider: "coinbase";
	providerId: string;
	assetId: string;
	type: "crypto";
}

const fiatCodes = new Set(Intl.supportedValuesOf("currency"));
export const currencyCodePattern = "^[A-Z0-9]{2,12}$";
export function cryptoCurrencyCode(symbol: string) {
	const normalized = symbol.trim().toUpperCase();
	if (!/^[A-Z0-9]{1,12}$/.test(normalized)) throw new RangeError("Símbolo cripto inválido");
	return normalized.length < 2 || fiatCodes.has(normalized) ? `CRYPTO${normalized}` : normalized;
}
const registry = new Map<string, CryptoAsset>();
export const cryptoAssets: CryptoAsset[] = [];
export function cryptoAsset(currency: string) {
	return registry.get(currency.trim().toUpperCase());
}
export function registerCryptoAssets(assets: readonly CryptoAsset[]) {
	const pending = new Map<string, CryptoAsset>();
	for (const entry of assets) {
		const code = normalizeCurrency(entry.code);
		if (
			code !== cryptoCurrencyCode(entry.symbol) ||
			entry.provider !== "coinbase" ||
			entry.providerId !== entry.symbol ||
			!entry.assetId ||
			!entry.name ||
			!Number.isInteger(entry.nativeDigits) ||
			entry.nativeDigits < 0 ||
			entry.nativeDigits > 18
		)
			throw new RangeError("Identidade cripto inválida");
		const previous = pending.get(code) ?? registry.get(code);
		if (previous && previous.assetId !== entry.assetId) throw new RangeError("Identidade cripto ambígua");
		const digits = Math.max(currencyDigits(code), entry.nativeDigits, previous?.digits ?? 0);
		pending.set(code, { ...entry, code, digits });
	}
	for (const [code, asset] of pending) {
		const previous = registry.get(code);
		if (previous) cryptoAssets.splice(cryptoAssets.indexOf(previous), 1, asset);
		else cryptoAssets.push(asset);
		registry.set(code, asset);
		registerAssetDecimals(code, asset.digits);
	}
}
registerCryptoAssets(
	(initialCatalog as CryptoAsset[]).map(asset => ({ ...asset, code: cryptoCurrencyCode(asset.symbol) })),
);
