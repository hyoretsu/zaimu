import { expect, test } from "bun:test";
import { statementMoney } from "./statement-money";

test("preserves monetary signs in extracted statement text", () => {
	for (const value of ["-R$ 1.234,56", "R$ -1.234,56", "−R$ 1.234,56", "1.234,56 -"])
		expect(statementMoney(value)).toBe(-1234.56);
	expect(statementMoney("R$ 1.234,56")).toBe(1234.56);
});
