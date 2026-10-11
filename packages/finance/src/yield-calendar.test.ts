import { expect, test } from "bun:test";
import { currencyHolidayDates } from "./yield-calendar";

test("holidays apply only to associated currencies and include every associated country", () => {
	const countries = [
		{
			code: "BR",
			currencies: ["BRL"],
			holidays: [{ date: "2026-10-12", id: "1", name: "Feriado" }],
			name: "Brasil",
		},
		{
			code: "PT",
			currencies: ["EUR"],
			holidays: [{ date: "2026-10-05", id: "2", name: "Feriado" }],
			name: "Portugal",
		},
		{
			code: "FR",
			currencies: ["EUR"],
			holidays: [{ date: "2026-07-14", id: "3", name: "Feriado" }],
			name: "França",
		},
	];
	expect([...currencyHolidayDates(countries, "BRL")]).toEqual(["2026-10-12"]);
	expect([...currencyHolidayDates(countries, "EUR")]).toEqual(["2026-10-05", "2026-07-14"]);
	expect([...currencyHolidayDates(countries, "USD")]).toEqual([]);
});
