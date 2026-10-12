// ISO 3166-1 alpha-2 countries and territories.
export { countryCodes } from "@zaimu/finance/country-codes";

export function countryName(
	code: string,
	locale = typeof document === "undefined" ? "pt-BR" : document.documentElement.lang || "pt-BR",
) {
	if (!/^[A-Z]{2}$/.test(code)) return code;
	try {
		return new Intl.DisplayNames(locale, { type: "region" }).of(code) ?? code;
	} catch {
		return new Intl.DisplayNames("pt-BR", { type: "region" }).of(code) ?? code;
	}
}
