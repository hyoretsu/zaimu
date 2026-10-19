import { expect, test } from "bun:test";
import { CreditStatementReturn } from "~/modules/creditCards/infra/elysia/CreditCardReadReturn";
import { CreditCardStatementDetailReturn, CreditCardStatementReturn } from "./transport-contracts";

test("statement list and detail contracts expose scheduled payment amounts", () => {
	for (const schema of [CreditStatementReturn, CreditCardStatementReturn, CreditCardStatementDetailReturn]) {
		expect(schema.properties.scheduledPaymentAmount.type).toBe("number");
	}
});
