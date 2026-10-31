import { expect, test } from "bun:test";
import { calculateFinancialFees } from "./financial-fees";

test("IOF and spread apply independently to original foreign principal", () => {
	const fees = [
		{ amount: 3.5, name: "IOF", type: "PERCENTAGE" as const },
		{ amount: 2, name: "Spread", type: "PERCENTAGE" as const },
		{ amount: 1, name: "Serviço", type: "FIXED" as const },
	];
	expect(calculateFinancialFees(100, fees)).toBe(6.5);
	expect(calculateFinancialFees(100, [...fees].reverse())).toBe(6.5);
});
test("zero fees preserve principal and invalid fee values cannot enter through sync", () => {
	expect(calculateFinancialFees(100, [])).toBe(0);
	for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY])
		expect(() => calculateFinancialFees(100, [{ amount, name: "IOF", type: "FIXED" }])).toThrow(
			"Taxa inválida",
		);
	expect(() => calculateFinancialFees(100, [{ amount: 1, name: " ", type: "FIXED" }])).toThrow(
		"Taxa inválida",
	);
});
test("gas fees paid in another asset are not added to the moved principal", () => {
	const fees = [
		{ amount: 1, name: "Rede", type: "FIXED" as const },
		{ amount: 0.0021, assetCode: "ETH", name: "Gas", type: "FIXED" as const },
	];
	expect(calculateFinancialFees(100, fees, "USDC")).toBe(1);
	expect(calculateFinancialFees(100, [{ ...fees[1], assetCode: "usdc" }], "USDC")).toBe(0.0021);
});
