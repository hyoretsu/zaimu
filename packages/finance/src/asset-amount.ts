import { currencyDigits, isCryptoAsset, normalizeCurrency } from "./money";

/** Exact decimal amounts as strings; crypto never goes through `number`. */
const decimalPattern = /^-?\d+(\.\d+)?$/;

export function decimalToUnits(amount: string, asset: string): bigint {
	const digits = currencyDigits(asset);
	const text = amount.trim();
	if (!decimalPattern.test(text)) throw new RangeError("Valor decimal inválido");
	const negative = text.startsWith("-");
	const [integer, fraction = ""] = text.replace("-", "").split(".");
	if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits)))
		throw new RangeError(`Valor incompatível com a precisão de ${normalizeCurrency(asset)}`);
	const units = BigInt(integer + fraction.slice(0, digits).padEnd(digits, "0"));
	return negative ? -units : units;
}

export function unitsToDecimal(units: bigint, asset: string): string {
	const digits = currencyDigits(asset);
	const negative = units < 0n;
	const text = (negative ? -units : units).toString().padStart(digits + 1, "0");
	const integer = text.slice(0, text.length - digits);
	const fraction = text.slice(text.length - digits);
	return `${negative ? "-" : ""}${integer}${digits ? `.${fraction}` : ""}`;
}

export function addAssetAmounts(amounts: string[], asset: string): string {
	return unitsToDecimal(
		amounts.reduce((total, amount) => total + decimalToUnits(amount, asset), 0n),
		asset,
	);
}

export interface FormatAssetOptions {
	/** Show the asset code after crypto amounts and as ISO currency symbol for fiat. */
	locale?: string | readonly string[];
	/** Drop trailing zeros of crypto amounts (always keeps fiat precision). */
	trim?: boolean;
}

/** Symbol shown for an asset: the currency symbol for fiat (R$), the code for crypto. */
export function assetSymbol(asset: string, locale: string | readonly string[] = "pt-BR"): string {
	const code = normalizeCurrency(asset);
	if (isCryptoAsset(code)) return code;
	return (
		new Intl.NumberFormat(locale, { currency: code, style: "currency" })
			.formatToParts(0)
			.find(part => part.type === "currency")?.value ?? code
	);
}

/** Single formatter for fiat and crypto. Accepts exact decimal strings or fiat numbers. */
export function formatAsset(
	amount: string | number,
	asset: string,
	{ locale = "pt-BR", trim = true }: FormatAssetOptions = {},
): string {
	const code = normalizeCurrency(asset);
	if (!isCryptoAsset(code)) {
		return new Intl.NumberFormat(locale, { currency: code, style: "currency" })
			.formatToParts(Number(amount))
			.map(part => (part.type === "literal" && /^\s+$/.test(part.value) ? " " : part.value))
			.join("");
	}
	const digits = currencyDigits(code);
	const decimal =
		typeof amount === "number"
			? amount.toFixed(digits)
			: unitsToDecimal(decimalToUnits(amount, code), code);
	const negative = decimal.startsWith("-");
	const [integer, fraction = ""] = decimal.replace("-", "").split(".");
	const kept = trim ? fraction.replace(/0+$/, "") : fraction;
	const group = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1000.5);
	const groupSeparator = group.find(part => part.type === "group")?.value ?? "";
	const decimalSeparator = group.find(part => part.type === "decimal")?.value ?? ".";
	const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
	return `${negative ? "-" : ""}${grouped}${kept ? decimalSeparator + kept : ""} ${code}`;
}
