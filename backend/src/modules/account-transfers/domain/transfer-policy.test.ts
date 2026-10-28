import { describe, expect, test } from "bun:test";
import { availableTransferName, recurrenceMoves, transferVersion } from "./transfer-policy";

describe("account transfer policy", () => {
	test("preserves scope and finds deterministic names without merging", () => {
		const occupied = new Set(["Conta", "Conta (2)"]);
		expect(availableTransferName("Conta", occupied)).toBe("Conta (3)");
		expect(availableTransferName("Conta", occupied)).toBe("Conta (4)");
		expect(availableTransferName("x".repeat(70), new Set(["x".repeat(70)])).length).toBe(70);
	});
	test("moves schedules only when every account moves", () => {
		expect(recurrenceMoves(["a", null], new Set(["a"]))).toBe(true);
		expect(recurrenceMoves(["a", "b"], new Set(["a"]))).toBe(false);
		expect(recurrenceMoves([], new Set())).toBe(false);
	});
	test("review version changes for edited financial data", () => {
		expect(transferVersion({ balance: 10 })).not.toBe(transferVersion({ balance: 11 }));
		expect(transferVersion({ balance: 10 })).toHaveLength(64);
	});
});
