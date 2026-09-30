import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { serializeYield, YieldReturn } from "./FinancialAccountYieldsController";

describe("financial account yield response", () => {
	test("accepts serialized cached yields with database date and time values", () => {
		const yieldEntry = serializeYield({
			amount: "12.5",
			date: new Date("2026-09-29T00:00:00.000Z"),
			financialAccountId: "account-id",
			id: "yield-id",
			isExcluded: false,
			isHidden: false,
			kind: "MANUAL",
			origin: "USER",
			time: "13:30:00.000",
		});
		const cachedYield = JSON.parse(JSON.stringify(yieldEntry));

		expect(cachedYield).toMatchObject({
			amount: 12.5,
			date: "2026-09-29T00:00:00.000Z",
			time: "13:30",
		});
		expect(Value.Check(YieldReturn, cachedYield)).toBe(true);
	});
});
