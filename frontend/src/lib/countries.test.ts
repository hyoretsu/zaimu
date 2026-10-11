import { describe, expect, test } from "bun:test";
import { countryCodes, countryName } from "./countries";

describe("country names", () => {
	test("covers all 249 ISO countries and territories without duplicates", () => {
		expect(countryCodes).toHaveLength(249);
		expect(new Set(countryCodes).size).toBe(249);
		for (const code of countryCodes) {
			expect(code).toMatch(/^[A-Z]{2}$/);
			expect(countryName(code, "pt-BR")).not.toBe(code);
			expect(countryName(code, "en")).not.toBe(code);
		}
	});
	test("translates country names by language", () => {
		expect(countryName("DE", "pt-BR")).toBe("Alemanha");
		expect(countryName("DE", "en")).toBe("Germany");
		expect(countryName("DE", "de")).toBe("Deutschland");
		expect(countryName("JP", "ja")).toBe("日本");
	});
	test("handles malformed codes and locales", () => {
		expect(countryName("invalid", "en")).toBe("invalid");
		expect(countryName("BR", "invalid_locale")).toBe("Brasil");
	});
});
