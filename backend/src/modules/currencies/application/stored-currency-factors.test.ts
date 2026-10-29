import { expect, test } from "bun:test";
import { storedCurrencyFactors } from "./stored-currency-factors";

for (const count of [10, 10_000, 100_000])
	test(`deduplicates ${count} demands into one snapshot read`, async () => {
		let reads = 0;
		const result = await storedCurrencyFactors(
			Array.from({ length: count }, () => ({ date: "2026-10-01", source: "USD" })),
			"BRL",
			async keys => {
				reads++;
				expect(keys).toEqual([
					{ baseCurrency: "USD", date: "2026-10-01" },
					{ baseCurrency: "BRL", date: "2026-10-01" },
				]);
				return keys.map(key => ({ ...key, rates: { BRL: 5 } }));
			},
		);
		expect(reads).toBe(1);
		expect([...result]).toEqual([["USD:2026-10-01", 5]]);
	});

test("requires destination snapshot and finite positive date-specific rates", async () => {
	const requests = [1, 2, 3, 4, 5].map(day => ({ date: `2026-10-0${day}`, source: "USD" }));
	const result = await storedCurrencyFactors(requests, "BRL", async keys =>
		keys
			.filter(key => key.date !== "2026-10-02" || key.baseCurrency !== "BRL")
			.map(key => ({
				...key,
				rates: {
					BRL: (
						{
							"2026-10-01": 5,
							"2026-10-02": 6,
							"2026-10-03": 0,
							"2026-10-04": Number.POSITIVE_INFINITY,
							"2026-10-05": -1,
						} as Record<string, number>
					)[key.date]!,
				},
			})),
	);
	expect([...result]).toEqual([["USD:2026-10-01", 5]]);
});

test("normalizes lookup keys while retaining original demand keys", async () => {
	const result = await storedCurrencyFactors(
		[{ date: "2026-10-01T12:00:00Z", source: " usd " }],
		"brl",
		async keys => keys.map(key => ({ ...key, rates: { BRL: 5 } })),
	);
	expect(result.get(" usd :2026-10-01T12:00:00Z")).toBe(5);
});

test("identity and invalid demands need no read; invalid target rejects", async () => {
	const read = async () => {
		throw new Error("unexpected read");
	};
	expect([
		...(await storedCurrencyFactors(
			[
				{ date: "2026-10-01", source: "brl" },
				{ date: "2026-02-30", source: "USD" },
				{ date: "2026-10-01", source: "bad-code" },
			],
			"BRL",
			read,
		)),
	]).toEqual([["brl:2026-10-01", 1]]);
	await expect(storedCurrencyFactors([], "invalid", read)).rejects.toThrow();
});

test("reader failures propagate to caller fallback", async () => {
	await expect(
		storedCurrencyFactors([{ date: "2026-10-01", source: "USD" }], "BRL", async () => {
			throw new Error("offline");
		}),
	).rejects.toThrow("offline");
});
