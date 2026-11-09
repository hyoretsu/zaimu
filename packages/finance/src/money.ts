/** Monetary values always identify their denomination. Rates/points are not Money. */
export interface Money {
	amount: number;
	currency: string;
}

const precision = new Map<string, number>();
/** Decimals of well-known crypto assets; `Asset.decimals` overrides them through `registerAssetDecimals`. */
const cryptoDecimals = new Map<string, number>([
	["AVAX", 18],
	["BNB", 18],
	["BTC", 8],
	["DAI", 18],
	["DOGE", 8],
	["ETH", 18],
	["LTC", 8],
	["MATIC", 18],
	["SOL", 9],
	["USDC", 6],
	["USDT", 6],
	["XRP", 6],
]);

export function normalizeCurrency(value: string): string {
	const currency = value.trim().toUpperCase();
	if (!/^[A-Z0-9]{2,12}$/.test(currency)) throw new RangeError("Código de moeda inválido");
	return currency;
}

/** Register the catalog precision of a non-ISO asset (e.g. from `Asset.decimals`). */
export function registerAssetDecimals(code: string, decimals: number) {
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
		throw new RangeError("Casas decimais inválidas");
	const normalized = normalizeCurrency(code);
	cryptoDecimals.set(normalized, decimals);
	precision.delete(normalized);
}

/** True for assets without an ISO 4217 denomination: registered crypto or any code that is not a 3-letter ISO currency. */
export function isCryptoAsset(value: string): boolean {
	const currency = normalizeCurrency(value);
	if (cryptoDecimals.has(currency)) return true;
	const cached = isoCurrencyChecks.get(currency);
	if (cached !== undefined) return cached;
	const crypto = !/^[A-Z]{3}$/.test(currency) || !isSupportedIsoCurrency(currency);
	isoCurrencyChecks.set(currency, crypto);
	return crypto;
}
/** `Intl.supportedValuesOf` builds a fresh array on every call; the answer never changes per code. */
const isoCurrencyChecks = new Map<string, boolean>();
function isSupportedIsoCurrency(currency: string) {
	try {
		new Intl.NumberFormat("en", { currency, style: "currency" });
		return Intl.supportedValuesOf("currency").includes(currency);
	} catch {
		return false;
	}
}

export function currencyDigits(value: string): number {
	const currency = normalizeCurrency(value);
	const cached = precision.get(currency);
	if (cached !== undefined) return cached;
	const registered = cryptoDecimals.get(currency);
	const digits =
		registered ??
		(/^[A-Z]{3}$/.test(currency)
			? (new Intl.NumberFormat("en", { currency, style: "currency" }).resolvedOptions()
					.maximumFractionDigits ?? 2)
			: 8);
	precision.set(currency, digits);
	return digits;
}

export function currencyScale(currency = "BRL"): number {
	return 10 ** currencyDigits(currency);
}

/** Strict boundary conversion. Do not truncate fractions incompatible with the currency. */
export function toMinorUnits(amount: number, currency = "BRL", minimum = 0): number {
	const scale = currencyScale(currency);
	const units = Math.round(amount * scale);
	if (
		!Number.isFinite(amount) ||
		!Number.isSafeInteger(units) ||
		units < minimum ||
		Math.abs(units / scale - amount) > 1e-8
	)
		throw new RangeError(`Valor incompatível com a precisão de ${currency}`);
	return units;
}

export function fromMinorUnits(units: number, currency = "BRL"): number {
	if (!Number.isSafeInteger(units)) throw new RangeError("Valor monetário fora do limite seguro");
	return units / currencyScale(currency);
}

export function roundMoney(amount: number, currency = "BRL"): number {
	const scale = currencyScale(currency);
	if (!Number.isFinite(amount)) throw new RangeError("Valor monetário inválido");
	const units = Math.round(
		(amount + Math.sign(amount) * Number.EPSILON * Math.max(1, Math.abs(amount))) * scale,
	);
	return fromMinorUnits(units, currency);
}

/** Convert cumulative fixed allocations so rounded participants conserve their total. */
export function convertFixedSplit<
	T extends
		| {
				currency?: string;
				mode: string;
				participants: Array<{ debtPersonId: string; fixedAmount?: number }>;
		  }
		| null
		| undefined,
>(split: T, rate: number, from: string, to: string): T {
	if (split?.mode !== "FIXED") return split;
	from = split.currency ?? from;
	if (from === to) return split;
	if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("Cotação inválida");
	let sourceUnits = 0;
	let allocated = 0;
	const participants = split.participants.map(participant => {
		sourceUnits += toMinorUnits(participant.fixedAmount ?? 0, from);
		const cumulative = toMinorUnits(roundMoney(fromMinorUnits(sourceUnits, from) * rate, to), to);
		const fixedAmount = fromMinorUnits(cumulative - allocated, to);
		allocated = cumulative;
		return { ...participant, fixedAmount };
	});
	return { ...split, currency: to, participants } as T;
}

export async function convertFixedSplitAtDate<
	T extends
		| {
				currency?: string;
				mode: string;
				participants: Array<{ debtPersonId: string; fixedAmount?: number }>;
		  }
		| null
		| undefined,
>(
	split: T,
	date: string | Date,
	from: string,
	to: string,
	lookup: (date: string | Date, from: string, to: string) => Promise<number>,
): Promise<T> {
	const source = split?.currency ?? from;
	if (split?.mode !== "FIXED" || source === to) return split;
	return convertFixedSplit(split, await lookup(date, source, to), source, to);
}

export function formatMoney(amount: number, currency: string, locale?: string): string {
	return new Intl.NumberFormat(locale, { currency: normalizeCurrency(currency), style: "currency" }).format(
		amount,
	);
}

export function addMoney(values: readonly Money[], currency: string): Money {
	let units = 0;
	for (const value of values) {
		if (normalizeCurrency(value.currency) !== normalizeCurrency(currency))
			throw new RangeError("Converta moedas antes de somar");
		units += toMinorUnits(value.amount, currency, -Number.MAX_SAFE_INTEGER);
		if (!Number.isSafeInteger(units)) throw new RangeError("Total monetário fora do limite seguro");
	}
	return { amount: fromMinorUnits(units, currency), currency: normalizeCurrency(currency) };
}
