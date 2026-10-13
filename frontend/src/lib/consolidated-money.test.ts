import { expect, test } from "bun:test";
import { consolidateMoney } from "./consolidated-money";

test("converts mixed currencies before accumulating, including negative balances", async () => {
	const calls: string[] = [];
	const total = await consolidateMoney(
		[
			{ amount: 100, currency: "BRL" },
			{ amount: 20, currency: "USD" },
			{ amount: -5, currency: "USD" },
			{ amount: 10, currency: "EUR" },
		],
		"BRL",
		async source => {
			calls.push(source);
			return source === "USD" ? 5 : 6;
		},
	);
	expect(total).toBe(235);
	expect(calls.sort()).toEqual(["EUR", "USD"]);
});

test("same-currency and zero positions do not require exchange rates", async () => {
	expect(
		await consolidateMoney(
			[
				{ amount: 12, currency: "USD" },
				{ amount: 0, currency: "BRL" },
			],
			"USD",
			async () => {
				throw new Error("Unexpected exchange");
			},
		),
	).toBe(12);
	expect(await consolidateMoney([], "USD", async () => 1)).toBe(0);
});

test("missing or invalid exchange rates never produce a partial total", async () => {
	for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		await expect(
			consolidateMoney(
				[
					{ amount: 100, currency: "BRL" },
					{ amount: 20, currency: "USD" },
				],
				"BRL",
				async () => rate,
			),
		).rejects.toThrow("Cotação indisponível");
	}
	await expect(
		consolidateMoney([{ amount: 20, currency: "USD" }], "BRL", async () => {
			throw new Error("Unavailable");
		}),
	).rejects.toThrow("Unavailable");
});
