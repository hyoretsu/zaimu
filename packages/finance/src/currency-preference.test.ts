import { expect, test } from "bun:test";
import {
	countryCurrency,
	effectiveCurrency,
	locationCacheMs,
	travelSuggestionKey,
	validCurrencyLocation,
} from "./currency-preference";

const supported = ["BRL", "USD", "EUR", "JPY", "KWD"];
test("currency preference uses explicit choice, IP, explicit region, then USD", () => {
	const location = { country: "JP", currency: "JPY", detectedAt: 100 };
	expect(effectiveCurrency("BRL", location, ["en-US"], supported)).toBe("BRL");
	expect(effectiveCurrency(null, location, ["en-US"], supported)).toBe("JPY");
	expect(effectiveCurrency(null, null, ["pt-BR"], supported)).toBe("BRL");
	expect(effectiveCurrency(null, null, ["pt"], supported)).toBe("USD");
	expect(countryCurrency("KW", supported)).toBe("KWD");
});
test("seven-day device cache and travel dismissal combinations", () => {
	const location = { country: "JP", currency: "JPY", detectedAt: 100 };
	expect(validCurrencyLocation(location, 100 + locationCacheMs - 1)).toBe(true);
	expect(validCurrencyLocation(location, 100 + locationCacheMs)).toBe(false);
	expect(validCurrencyLocation(location, 99)).toBe(false);
	expect(travelSuggestionKey("user", "BRL", location)).toBe(
		travelSuggestionKey("user", "BRL", { ...location, detectedAt: 999 }),
	);
	expect(travelSuggestionKey("guest", "BRL", location)).not.toBe(
		travelSuggestionKey("user", "BRL", location),
	);
});
