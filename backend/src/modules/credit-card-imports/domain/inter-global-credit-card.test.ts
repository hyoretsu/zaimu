import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCreditCardStatementText } from "./credit-card-statement-parser";

test("parses an Inter Global USD statement", () => {
	const text = readFileSync(new URL("./fixtures/inter-global-usd-2026-10.txt", import.meta.url), "utf8");
	const statement = parseCreditCardStatementText(text, "INTER");
	expect(statement.dueDate).toBe("2026-11-10");
	expect(statement.statementDate).toBe("2026-10-31");
	expect(statement.purchases).toEqual([
		{
			currentInstallment: 1,
			description: "STEAMGAMES.COM 4259522 BELLEVUE WAUSA",
			installmentAmount: 8.48,
			installments: 1,
			purchaseDate: "2026-10-07",
			totalAmount: 8.48,
		},
	]);
});
