import { expect, test } from "bun:test";
import {
	creditDailyYield,
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
	expect(ledger.accrueGross(100, { yieldTaxIds: ["ir"] }, day(200))).toBeCloseTo(80);
	expect(ledger.lots.map(lot => lot.balance)).toEqual([1080, 1000]);
	ledger.applyCashFlow(-1100, day(201));
	expect(ledger.lots).toEqual([{ balance: 980, date: day(200), principal: 980 }]);
	expect(ledger.netYield(100, { yieldTaxIds: ["ir"] }, day(201))).toBeCloseTo(77.5);
});
test("debt, manual yields and adjustments", () => {
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(-100, day(0));
	ledger.applyCashFlow(150, day(1));
	expect(ledger.lots).toEqual([{ balance: 50, date: day(1), principal: 50 }]);
	ledger.accrueNet(10, day(2));
	ledger.adjustBalance(100, day(3));
	expect(ledger.lots).toEqual([
		{ balance: 60, date: day(1), principal: 50 },
		{ balance: 40, date: day(3), principal: 40 },
	]);
	ledger.adjustBalance(20, day(4));
	expect(ledger.lots).toEqual([{ balance: 20, date: day(3), principal: 20 }]);
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

test("same-day deposits wait until tomorrow and withdrawals reduce eligible principal", () => {
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(580, "2026-09-30");
	expect(ledger.eligibleBalance("2026-09-30")).toBe(0);
	expect(ledger.accrueGross(1, undefined, "2026-09-30")).toBe(0);
	expect(ledger.eligibleBalance("2026-10-01")).toBe(580);
	ledger.applyCashFlow(420, "2026-10-01");
	ledger.applyCashFlow(-200, "2026-10-01");
	expect(ledger.eligibleBalance("2026-10-01")).toBe(380);
	expect(ledger.accrueGross(38, undefined, "2026-10-01")).toBe(38);
	expect(ledger.lots).toEqual([
		{ balance: 418, date: "2026-09-30", principal: 380 },
		{ balance: 420, date: "2026-10-01", principal: 420 },
	]);
	expect(ledger.eligibleBalance("2026-10-02")).toBe(838);
});
test("recorded and manual amounts remain effective on contribution day", () => {
	const ledger = new YieldTaxLedger([{ balance: 580, date: "2026-09-30" }]);
	ledger.accrueRecordedNet(0.35, undefined, "2026-09-30");
	ledger.accrueNet(1, "2026-09-30");
	expect(ledger.balance).toBeCloseTo(581.35);
});
test("on-redemption mode keeps the balance gross and defers tax on the gain", () => {
	const settings = { yieldTaxIds: ["ir"], yieldTaxMode: "ON_REDEMPTION" };
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(1000, day(0));
	expect(ledger.accrueGross(100, settings, day(200))).toBeCloseTo(100);
	expect(ledger.balance).toBeCloseTo(1100);
	expect(ledger.deferredTax(settings, day(200))).toBeCloseTo(20);
	expect(ledger.netBalance(settings, day(200))).toBeCloseTo(1080);
	expect(ledger.netBalance(settings, day(400))).toBeCloseTo(1082.5);
});
test("daily mode never owes deferred tax", () => {
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(1000, day(0));
	ledger.accrueGross(100, { yieldTaxIds: ["ir"] }, day(200));
	expect(ledger.deferredTax({ yieldTaxIds: ["ir"] }, day(200))).toBe(0);
});
test("withdrawals shrink principal pro rata so only the remaining gain is taxable", () => {
	const settings = { yieldTaxIds: ["ir"], yieldTaxMode: "ON_REDEMPTION" };
	const ledger = new YieldTaxLedger();
	ledger.applyCashFlow(1000, day(0));
	ledger.accrueGross(100, settings, day(200));
	ledger.applyCashFlow(-550, day(200));
	expect(ledger.lots).toEqual([{ balance: 550, date: day(0), principal: 500 }]);
	expect(ledger.deferredTax(settings, day(200))).toBeCloseTo(10);
});

test("checking daily yield carries sub-cent fractions until they complete a cent", () => {
	let carry = 0;
	const credited: number[] = [];
	for (let day = 0; day < 4; day++) {
		const result = creditDailyYield("CHECKING", 0.004, carry);
		carry = result.carry;
		credited.push(result.credited);
	}
	expect(credited).toEqual([0, 0, 0.01, 0]);
	expect(carry).toBeCloseTo(0.006, 9);
	expect(creditDailyYield("INVESTMENT", 0.004, 0)).toEqual({ carry: 0, credited: 0.004 });
});
