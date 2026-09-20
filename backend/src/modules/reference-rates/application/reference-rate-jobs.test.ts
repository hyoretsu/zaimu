import { expect, test } from "bun:test";
import { getReferenceRateRetryDelay } from "./reference-rate-jobs";

test("uses persistent exponential retry delays and caps at one day", () =>
	expect([0, 1, 2, 3, 4, 5].map(attempt => getReferenceRateRetryDelay(attempt, undefined))).toEqual([
		60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000,
	]));
test("honors Retry-After without scheduling below one minute", () => {
	expect(getReferenceRateRetryDelay(0, "120")).toBe(120_000);
	expect(getReferenceRateRetryDelay(0, "1")).toBe(60_000);
});
