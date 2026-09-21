import { describe, expect, test } from "bun:test";
import { buildBcbReferenceRateUrl, parseBcbReferenceRateResponse } from "./bcb-reference-rates";

describe("BCB reference rates", () => {
	test("maps CDI and formats the requested range", () => {
		const url = buildBcbReferenceRateUrl(
			"CDI",
			new Date("2020-01-01T12:00:00"),
			new Date("2026-09-17T12:00:00"),
		);
		expect(url.pathname).toContain("bcdata.sgs.12");
		expect(url.searchParams.get("dataInicial")).toBe("01/01/2020");
		expect(url.searchParams.get("dataFinal")).toBe("17/09/2026");
	});
	test("maps Selic to series 11", () =>
		expect(buildBcbReferenceRateUrl("SELIC", new Date(), new Date()).pathname).toContain("bcdata.sgs.11"));
	test("parses daily values without UTC date shifts", () =>
		expect(parseBcbReferenceRateResponse([{ data: "17/09/2026", valor: "0.050788" }])).toEqual([
			{ date: new Date("2026-09-17T12:00:00"), value: 0.050788 },
		]));
	test("accepts an empty period while the BCB has no published values", () =>
		expect(parseBcbReferenceRateResponse([])).toEqual([]));
	test("rejects malformed records", () =>
		expect(() => parseBcbReferenceRateResponse([{ data: "2026-09-17", valor: "x" }])).toThrow());
});
