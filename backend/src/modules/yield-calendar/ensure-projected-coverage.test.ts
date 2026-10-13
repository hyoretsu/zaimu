import { expect, test } from "bun:test";
import { ensureProjectedCoverage } from "./ensure-projected-coverage";

test("coverage work scales with distinct currencies/countries/years, not account history", async () => {
	for (const size of [10, 10000, 100000]) {
		const currencies: string[] = [];
		const calendars: string[] = [];
		const accounts = Array.from({ length: size }, (_, index) => ({
			countryCode: "BR",
			currency: "BRL",
			id: String(index),
		}));
		const result = await ensureProjectedCoverage(accounts, [2026, 2027, 2026], {
			calendar: async (country, year) => {
				calendars.push(`${country}:${year}`);
				return "COMPLETE";
			},
			currency: async currency => {
				currencies.push(currency);
			},
		});
		expect(currencies).toEqual(["BRL"]);
		expect(calendars.sort()).toEqual(["BR:2026", "BR:2027"]);
		expect(result.size).toBe(size);
		expect([...result.values()].every(Boolean)).toBeTrue();
	}
});

test("missing country and incomplete years never become available; currencies still register", async () => {
	const currencies: string[] = [];
	const result = await ensureProjectedCoverage(
		[
			{ id: "missing" },
			{ countryCode: "US", currency: "USD", id: "partial" },
			{ countryCode: "BR", currency: "USD", id: "complete" },
		],
		[2026, 2027],
		{
			calendar: async (country, year) => (country === "US" && year === 2027 ? "UNSUPPORTED" : "COMPLETE"),
			currency: async currency => {
				currencies.push(currency);
			},
		},
	);
	expect(currencies.sort()).toEqual(["BRL", "USD"]);
	expect([...result]).toEqual([
		["missing", false],
		["partial", false],
		["complete", true],
	]);
});

test("coverage registration failure propagates instead of publishing partial availability", async () => {
	await expect(
		ensureProjectedCoverage([{ countryCode: "BR", id: "account" }], [2026], {
			calendar: async () => "COMPLETE",
			currency: async () => {
				throw new Error("Registration unavailable");
			},
		}),
	).rejects.toThrow("Registration unavailable");
});
