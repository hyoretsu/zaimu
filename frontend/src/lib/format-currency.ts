import { formatAsset } from "@zaimu/finance/asset-amount";
import { isCryptoAsset } from "@zaimu/finance/money";

export function createCurrencyFormatter(currency: string, locales: string | readonly string[]) {
	if (isCryptoAsset(currency))
		return { format: (value: number | string) => formatAsset(value, currency, { locale: locales }) };
	const formatter = new Intl.NumberFormat(locales, { currency, style: "currency" });
	return {
		format(value: number) {
			const parts = formatter.formatToParts(value);
			return parts
				.map((part, index) => {
					if (
						part.type === "literal" &&
						/^\s+$/.test(part.value) &&
						(parts[index - 1]?.type === "currency" || parts[index + 1]?.type === "currency")
					)
						return "";
					if (part.type !== "currency") return part.value;
					const numberFollows = parts.slice(index + 1).some(next => next.type === "integer");
					return numberFollows ? `${part.value}\u00a0` : `\u00a0${part.value}`;
				})
				.join("");
		},
	};
}
