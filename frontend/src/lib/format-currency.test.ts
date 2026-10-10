import { describe, expect, test } from "bun:test";
import { createCurrencyFormatter } from "./format-currency";

describe("createCurrencyFormatter", () => {
	test("separates leading currency from the localized amount", () => {
		expect(createCurrencyFormatter("BRL", "en-US").format(5170.6)).toBe("R$\u00a05,170.60");
		expect(createCurrencyFormatter("BRL", "pt-BR").format(-5170.6)).toBe("-R$\u00a05.170,60");
	});
	test("preserves trailing currency without doubling its space", () => {
		expect(createCurrencyFormatter("EUR", "de-DE").format(5170.6)).toBe("5.170,60\u00a0€");
	});
});
