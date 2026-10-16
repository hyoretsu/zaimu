import { expect, test } from "bun:test";
import { getCreditCardStatementPdfPasswordConfiguration } from "./credit-card-imports";

test("returns PDF password configuration without requiring a password", () => {
	const interPassword = getCreditCardStatementPdfPasswordConfiguration("INTER");
	const bradescoPassword = getCreditCardStatementPdfPasswordConfiguration("BRADESCO");
	expect(interPassword).toEqual({ placeholder: "Ex: 123456" });
	expect(bradescoPassword).toBe(interPassword);
	expect(getCreditCardStatementPdfPasswordConfiguration("MERCADO_PAGO")).toEqual({
		placeholder: "Ex: 123456",
	});
	expect(getCreditCardStatementPdfPasswordConfiguration("NUBANK")).toBeNull();
});
