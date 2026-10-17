import {
	defaultTaxDefinitions,
	setTaxDefinitions,
	type TaxDefinition,
	validateTaxBrackets,
} from "@zaimu/finance/yield-tax";
import { getTaxDefinitions } from "./api";

const key = "zaimu-tax-catalog-v1";
export function cachedTaxCatalog(): TaxDefinition[] {
	try {
		const stored = JSON.parse(localStorage.getItem(key) ?? "null") as TaxDefinition[] | null;
		if (stored?.length) {
			for (const tax of stored) for (const version of tax.versions) validateTaxBrackets(version.brackets);
			return stored;
		}
	} catch {
		/* Use bundled catalog when cache is unavailable. */
	}
	return defaultTaxDefinitions;
}
export async function fetchTaxCatalog() {
	const definitions = await getTaxDefinitions({ authenticated: false });
	setTaxDefinitions(definitions);
	localStorage.setItem(key, JSON.stringify(definitions));
	return definitions;
}
setTaxDefinitions(cachedTaxCatalog());
