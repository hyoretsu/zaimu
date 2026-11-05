import { describe, expect, test } from "bun:test";
import { realtimeCacheOperations } from "./realtime-operations";

describe("realtimeCacheOperations", () => {
	test("maps worker recalculations of an account to the account domains", () => {
		expect(realtimeCacheOperations("financialAccount")).toEqual(["account"]);
	});

	test("ignores aggregates without client-side caches", () => {
		expect(realtimeCacheOperations("unknown")).toEqual([]);
	});
});
