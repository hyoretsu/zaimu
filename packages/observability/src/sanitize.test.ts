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

test("large arrays inspect at most twenty slots without enumerating their keys", () => {
	let descriptors = 0;
	const input = new Proxy(new Array(1000000), {
		getOwnPropertyDescriptor(target, key) {
			descriptors++;
			return Reflect.getOwnPropertyDescriptor(target, key);
		},
		ownKeys() {
			throw new Error("full enumeration is forbidden");
		},
	});
	const result = JSON.parse(summarize(input));
	expect(result.count).toBe(1000000);
	expect(result.items).toHaveLength(20);
	expect(descriptors).toBe(21);
	expect(summarize(new Uint8Array(1000000))).toBe('"[binary]"');
});

test("wide objects inspect only fixed technical fields without enumerating keys", () => {
	let descriptors = 0;
	const input = new Proxy(
		{ amount: 12345, status: 200 },
		{
			getOwnPropertyDescriptor(target, key) {
				descriptors++;
				return Reflect.getOwnPropertyDescriptor(target, key);
			},
			ownKeys() {
				throw new Error("full enumeration is forbidden");
			},
		},
	);
	const result = JSON.parse(summarize(input));
	expect(result).toEqual({ status: 200, type: "[object]" });
	expect(descriptors).toBeLessThanOrEqual(20);
});
