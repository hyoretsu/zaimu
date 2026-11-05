import { describe, expect, test } from "bun:test";
import { summarize } from "./sanitize";

describe("telemetry summaries", () => {
	test("retains technical values while redacting financial and identity fields", () => {
		const result = summarize({
			amount: 12345,
			email: "private@example.com",
			name: "Alice",
			password: "secret",
			status: 200,
		});
		expect(result).toContain("200");
		for (const value of ["12345", "secret", "Alice", "private@example.com"])
			expect(result).not.toContain(value);
	});
	test("never executes getters or toJSON", () => {
		let accessed = false;
		const value = {
			get password() {
				accessed = true;
				throw Error("getter");
			},
			toJSON() {
				accessed = true;
			},
		};
		summarize(value);
		expect(accessed).toBe(false);
	});
	test("bounds cycles and large collections", () => {
		const value: unknown[] = [];
		value.push(value, ...Array(100).fill({ status: "a".repeat(1000) }));
		const result = summarize(value);
		expect(result.length).toBeLessThanOrEqual(8192);
		expect(result).toContain("truncated");
	});
});
