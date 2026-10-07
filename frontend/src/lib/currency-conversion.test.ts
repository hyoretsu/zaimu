import { describe, expect, test } from "bun:test";
import { convertLocalMoney } from "./currency-conversion";

describe("guest currency amounts", () => {
	test("same currency adds independent fixed and percentage fees without network", async () => {
		const result = await convertLocalMoney(100, "2026-10-07", "BRL", "BRL", [
			{ amount: 3.5, name: "IOF", type: "PERCENTAGE" },
			{ amount: 2, name: "Spread", type: "PERCENTAGE" },
			{ amount: 1, name: "Tarifa", type: "FIXED" },
		]);
		expect(result.amount).toBe(106.5);
		expect(result.originalAmount).toBe(100);
		expect(result.exchangeRate).toBe(1);
	});
	test("invalid fees reject before financial persistence", async () => {
		await expect(
			convertLocalMoney(100, "2026-10-07", "BRL", "BRL", [{ amount: -1, name: "IOF", type: "FIXED" }]),
		).rejects.toThrow("Taxa inválida");
		await expect(convertLocalMoney(Number.NaN, "2026-10-07", "BRL", "BRL")).rejects.toThrow();
	});
});
