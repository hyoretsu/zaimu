import { describe, expect, test } from "bun:test";
import { addMoney, currencyDigits, fromMinorUnits, roundMoney, toMinorUnits } from "./money";

describe("ISO money", () => {
	test("preserves JPY, BRL and KWD denomination precision", () => {
		expect([currencyDigits("JPY"), currencyDigits("BRL"), currencyDigits("KWD")]).toEqual([0, 2, 3]);
		expect(toMinorUnits(100, "JPY")).toBe(100);
		expect(toMinorUnits(1.234, "KWD")).toBe(1234);
		expect(fromMinorUnits(1234, "KWD")).toBe(1.234);
		expect(roundMoney(1.2345, "KWD")).toBe(1.235);
		expect(() => toMinorUnits(1.5, "JPY")).toThrow();
	});
	test("never sums incompatible native books or unsafe integers", () => {
		expect(() => addMoney([{ amount: 1, currency: "USD" }], "BRL")).toThrow();
		expect(
			addMoney(
				[
					{ amount: 0.1, currency: "BRL" },
					{ amount: 0.2, currency: "BRL" },
				],
				"BRL",
			).amount,
		).toBe(0.3);
		expect(() => toMinorUnits(1e20, "KWD")).toThrow();
	});
});
