import { expect, test } from "bun:test";
import { requiresCreditCardStatementPdfPassword } from "./credit-card-statement-password";

test("returns whether a provider requires a PDF password", () => {
	expect(requiresCreditCardStatementPdfPassword("INTER")).toBe(true);
	expect(requiresCreditCardStatementPdfPassword("BRADESCO")).toBe(true);
	expect(requiresCreditCardStatementPdfPassword("NUBANK")).toBe(false);
});
