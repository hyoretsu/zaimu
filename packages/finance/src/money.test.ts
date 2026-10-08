import { describe, expect, test } from "bun:test";
import {
	addMoney,
	convertFixedSplit,
	convertFixedSplitAtDate,
	currencyDigits,
	fromMinorUnits,
	roundMoney,
	toMinorUnits,
} from "./money";

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

test("foreign fixed splits conserve native minor units after conversion", () => {
	const split = {
		mode: "FIXED",
		participants: [
			{ debtPersonId: "a", fixedAmount: 0.001 },
			{ debtPersonId: "b", fixedAmount: 0.001 },
			{ debtPersonId: "c", fixedAmount: 0.001 },
		],
	};
	const converted = convertFixedSplit(split, 500, "KWD", "JPY")!;
	expect(converted.participants.map(p => p.fixedAmount)).toEqual([1, 0, 1]);
	expect(split.participants.map(p => p.fixedAmount)).toEqual([0.001, 0.001, 0.001]);
	expect(convertFixedSplit({ ...split, mode: "SHARES" }, 500, "KWD", "JPY")?.participants).toBe(
		split.participants,
	);
	expect(() => convertFixedSplit(split, 0, "KWD", "JPY")).toThrow("Cotação");
});

test("fixed split uses its own explicit denomination when moving between books", async () => {
	const split = {
		currency: "KWD",
		mode: "FIXED",
		participants: [{ debtPersonId: "a", fixedAmount: 0.003 }],
	};
	const calls: unknown[] = [];
	const result = await convertFixedSplitAtDate(split, "2026-01-02", "USD", "JPY", async (...args) => {
		calls.push(args);
		return 500;
	});
	expect(result.participants[0].fixedAmount).toBe(2);
	expect(result.currency).toBe("JPY");
	expect(calls).toEqual([["2026-01-02", "KWD", "JPY"]]);
	expect(
		await convertFixedSplitAtDate(result, "2026-01-02", "USD", "JPY", async () => {
			throw new Error("Native conversion");
		}),
	).toBe(result);
});
