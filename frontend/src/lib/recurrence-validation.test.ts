import { expect, test } from "bun:test";
import type { RecurrenceInput } from "./recurrence";
import { validateRecurrenceInput } from "./recurrence-validation";

const valid: RecurrenceInput = {
	amount: 100,
	currency: "BRL",
	dayOfMonth: 24,
	interval: 1,
	isActive: true,
	movement: "EXPENSE",
	name: "Energia",
	originFinancialAccountId: "account",
	startDate: "2026-10-01",
	unit: "MONTH",
};

test("accepts complete recurrence", () => {
	expect(() => validateRecurrenceInput(valid)).not.toThrow();
});

for (const movement of ["EXPENSE", "INCOME", "TRANSFER", "CARD_PURCHASE", "CARD_PAYMENT"] as const) {
	test(`rejects missing required account or card for ${movement}`, () => {
		expect(() => validateRecurrenceInput({ ...valid, movement, originFinancialAccountId: null })).toThrow(
			"Selecione",
		);
	});
}

for (const patch of [
	{ name: "   " },
	{ amount: Number.NaN },
	{ amount: 0 },
	{ amount: -1 },
	{ currency: "" },
	{ interval: 0 },
	{ dayOfMonth: 32 },
	{ startDate: "" },
	{ endDate: "2026-09-30" },
	{ installments: 0 },
	{ destinationFinancialAccountId: "account", movement: "TRANSFER" as const },
]) {
	test(`rejects invalid recurrence ${JSON.stringify(patch)}`, () => {
		expect(() => validateRecurrenceInput({ ...valid, ...patch })).toThrow();
	});
}
