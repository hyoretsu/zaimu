import { describe, expect, it } from "bun:test";
import { t } from "elysia";
import { serializedResponse } from "./serialized-response";

describe("serialized response contracts", () => {
	it("keeps numeric input coercion outside response contracts", () => {
		const input = t.Object({ amount: t.Numeric(), count: t.Integer() });
		const response = serializedResponse(input);
		expect(response.properties.amount.type).toBe("number");
		expect(response.properties.count.type).toBe("integer");
		expect(input.properties.amount.anyOf).toBeDefined();
	});
	it("serializes nested and nullable dates without accepting numeric timestamps", () => {
		const response = serializedResponse(t.Array(t.Object({ createdAt: t.Nullable(t.Date()) })));
		expect(response.items.properties.createdAt.anyOf).toEqual([t.String({ format: "date-time" }), t.Null()]);
	});
	it("preserves validation bounds and nullable numeric branches", () => {
		const response = serializedResponse(t.Nullable(t.Numeric({ maximum: 10, minimum: 2 })));
		expect(response.anyOf[0]).toMatchObject({ maximum: 10, minimum: 2, type: "number" });
		expect(response.anyOf[1].type).toBe("null");
	});
});
