import { describe, expect, test } from "bun:test";
import { creditLimitOverview } from "./credit-limit";

describe("credit limit overview", () => {
	test("excess credit increases the effective and available limits", () => {
		expect(creditLimitOverview(1000, "BRL", [{ balanceAmount: -150.25 }])).toEqual({
			availableLimit: 1150.25,
			effectiveLimit: 1150.25,
			temporaryCredit: 150.25,
			usedLimit: 0,
		});
	});

	test("credits offset outstanding statements before determining used limit", () => {
		expect(creditLimitOverview(1000, "BRL", [{ balanceAmount: -150.25 }, { balanceAmount: 400.5 }])).toEqual({
			availableLimit: 749.75,
			effectiveLimit: 1000,
			temporaryCredit: 0,
			usedLimit: 250.25,
		});
	});

	test("available limit stays zero when debt exceeds the limit", () => {
		expect(creditLimitOverview(1000, "BRL", [{ balanceAmount: 1200 }]).availableLimit).toBe(0);
	});

	test("uses the card currency precision for excess credit", () => {
		expect(creditLimitOverview(100, "KWD", [{ balanceAmount: -1.234 }]).availableLimit).toBe(101.234);
		expect(creditLimitOverview(100, "JPY", [{ balanceAmount: -12 }]).availableLimit).toBe(112);
	});

	test("still rejects invalid monetary precision and negative configured limits", () => {
		expect(() => creditLimitOverview(100, "BRL", [{ balanceAmount: -1.234 }])).toThrow(RangeError);
		expect(() => creditLimitOverview(-100, "BRL", [])).toThrow(RangeError);
	});
});
