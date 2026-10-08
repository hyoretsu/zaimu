import { expect, test } from "bun:test";
import type { NormalizedRecord } from "../domain/normalize";
import { nativeReviewMoney } from "./native-review-money";

test("foreign review uses exact-date native units and leaves source snapshot intact", async () => {
	const remote = {
		amount: -1.001,
		currency: "KWD",
		date: "2026-01-02",
		totalAmount: -3.003,
	} as NormalizedRecord;
	const calls: unknown[] = [];
	const native = await nativeReviewMoney(remote, "JPY", async (...args) => {
		calls.push(args);
		return 500;
	});
	expect(native).toMatchObject({ amount: -501, currency: "JPY", totalAmount: -1502 });
	expect(remote).toMatchObject({ amount: -1.001, currency: "KWD" });
	expect(calls).toEqual([["2026-01-02", "KWD", "JPY"]]);
	expect(
		await nativeReviewMoney(native, "JPY", async () => {
			throw new Error("Double conversion");
		}),
	).toBe(native);
});
test("unpublished foreign conversion cannot silently reinterpret principal", async () => {
	const remote = { amount: 10, currency: "USD", date: "2026-01-02", totalAmount: null } as NormalizedRecord;
	await expect(
		nativeReviewMoney(remote, "BRL", async () => {
			throw new Error("Unavailable");
		}),
	).rejects.toThrow("Unavailable");
});
