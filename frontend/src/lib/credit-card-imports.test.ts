import { expect, test } from "bun:test";
import { getCreditCardStatementPdfPasswordConfiguration } from "./credit-card-imports";

test("returns PDF password configuration matching each provider's requirements", () => {
	const interPassword = getCreditCardStatementPdfPasswordConfiguration("INTER");
	const bradescoPassword = getCreditCardStatementPdfPasswordConfiguration("BRADESCO");
	expect(interPassword).toEqual({ placeholder: "Ex: 123456", required: true });
	expect(bradescoPassword).toBe(interPassword);
	expect(getCreditCardStatementPdfPasswordConfiguration("MERCADO_PAGO")).toEqual({
		placeholder: "Ex: 123456",
		required: false,
	});
	expect(getCreditCardStatementPdfPasswordConfiguration("NUBANK")).toBeNull();
});
