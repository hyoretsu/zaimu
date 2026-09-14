import { expect, test } from "bun:test";
import { getCreditCardStatementPdfPasswordConfiguration } from "./credit-card-imports";

test("returns the shared PDF password configuration for providers that require it", () => {
	const interPassword = getCreditCardStatementPdfPasswordConfiguration("INTER");
	const bradescoPassword = getCreditCardStatementPdfPasswordConfiguration("BRADESCO");
	expect(interPassword).toEqual({ placeholder: "Ex: 123456" });
	expect(bradescoPassword).toBe(interPassword);
	expect(getCreditCardStatementPdfPasswordConfiguration("NUBANK")).toBeNull();
});
