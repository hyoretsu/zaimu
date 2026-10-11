import { expect, test } from "bun:test";
import {
	defaultTaxDefinitions,
	retainedYieldFraction,
	validateTaxBrackets,
	YieldTaxLedger,
} from "./yield-tax";

const day = (age: number) => new Date(Date.UTC(2025, 0, 1 + age)).toISOString().slice(0, 10);
test("IR calendar-day boundaries", () => {
	for (const [age, rate] of [
		[0, 22.5],
		[180, 22.5],
		[181, 20],
		[360, 20],
		[361, 17.5],
		[720, 17.5],
		[721, 15],
	])
		expect(retainedYieldFraction({ yieldTaxIds: ["ir"] }, day(0), day(age))).toBeCloseTo(1 - rate / 100);
});
test("every IOF day including zero and expiry", () => {
	const rates = [
		100, 96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20,
		16, 13, 10, 6, 3, 0, 0,
	];
	for (const [age, rate] of rates.entries())
		expect(retainedYieldFraction({ yieldTaxIds: ["iof"] }, day(0), day(age))).toBeCloseTo(1 - rate / 100);
});
test("IOF before IR and fixed last, duplicate definitions do not double tax", () => {
	expect(100 * retainedYieldFraction({ yieldTaxIds: ["ir", "iof", "ir"] }, day(0), day(1))).toBeCloseTo(
		3.1,
	);
	expect(
		100 * retainedYieldFraction({ yieldTaxIds: ["ir", "iof"], yieldTaxRate: 10 }, day(0), day(1)),
	).toBeCloseTo(2.79);
});
test("daily net compounding keeps age per lot and FIFO withdrawals", () => {
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(1000, day(0));
	ledger.applyCashFlow(1000, day(200));
	expect(ledger.accrueGross(100, { yieldTaxIds: ["ir"] }, day(200))).toBeCloseTo(78.75);
	expect(ledger.lots.map(lot => lot.balance)).toEqual([1040, 1038.75]);
	ledger.applyCashFlow(-1100, day(201));
	expect(ledger.lots).toEqual([{ balance: 978.75, date: day(200) }]);
	expect(ledger.netYield(100, { yieldTaxIds: ["ir"] }, day(201))).toBeCloseTo(77.5);
});
test("debt, manual yields and adjustments", () => {
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(-100, day(0));
	ledger.applyCashFlow(150, day(1));
	expect(ledger.lots).toEqual([{ balance: 50, date: day(1) }]);
	ledger.accrueNet(10, day(2));
	ledger.adjustBalance(100, day(3));
	expect(ledger.lots).toEqual([
		{ balance: 60, date: day(1) },
		{ balance: 40, date: day(3) },
	]);
	ledger.adjustBalance(20, day(4));
	expect(ledger.lots).toEqual([{ balance: 20, date: day(3) }]);
});
test("recorded system yields reconstruct tax-weighted shares", () => {
	const first = new YieldTaxLedger([
		{ balance: 1000, date: day(0) },
		{ balance: 1000, date: day(200) },
	]);
	const amount = first.accrueGross(100, { yieldTaxIds: ["ir"] }, day(200));
	const replay = new YieldTaxLedger([
		{ balance: 1000, date: day(0) },
		{ balance: 1000, date: day(200) },
	]);
	replay.accrueRecordedNet(amount, { yieldTaxIds: ["ir"] }, day(200));
	expect(replay.lots).toEqual(first.lots);
});
test("tax versions switch on effective day without changing past", () => {
	const definitions = structuredClone(defaultTaxDefinitions);
	definitions[1]!.versions.push({
		applicationOrder: 1,
		brackets: [{ rate: 10, upToDays: null }],
		effectiveDate: day(10),
	});
	expect(retainedYieldFraction({ yieldTaxIds: ["ir"] }, day(0), day(9), definitions)).toBe(0.775);
	expect(retainedYieldFraction({ yieldTaxIds: ["ir"] }, day(0), day(10), definitions)).toBe(0.9);
});
test("invalid brackets reject gaps through implicit ordered ranges", () => {
	expect(() => validateTaxBrackets([{ rate: 10, upToDays: 5 }])).toThrow();
	expect(() =>
		validateTaxBrackets([
			{ rate: 10, upToDays: 5 },
			{ rate: 20, upToDays: 4 },
			{ rate: 0, upToDays: null },
		]),
	).toThrow();
	expect(() => validateTaxBrackets([{ rate: 101, upToDays: null }])).toThrow();
	expect(() => validateTaxBrackets([{ rate: 0, upToDays: null }])).not.toThrow();
});
