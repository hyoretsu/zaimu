import { t } from "elysia";

export const PaymentSuggestionReturn = t.Object({
	amount: t.Number(),
	cardName: t.String(),
	creditCardId: t.String(),
	currency: t.String(),
	dueDate: t.String(),
	financialAccountId: t.String(),
	statementId: t.String(),
});
export const ConfirmPaymentSuggestionDTO = t.Object({
	accountAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
	amount: t.Number({ exclusiveMinimum: 0 }),
	attemptId: t.String({ format: "uuid" }),
	date: t.String({ format: "date" }),
	financialAccountId: t.String({ maxLength: 36, minLength: 1 }),
	statementId: t.String({ maxLength: 36, minLength: 1 }),
});
export type ConfirmPaymentSuggestionDTO = typeof ConfirmPaymentSuggestionDTO.static;
export const ConfirmPaymentSuggestionReturn = t.Object({
	transaction: t.Object(
		{
			amount: t.Union([t.Number(), t.String()]),
			date: t.Union([t.Date(), t.String()]),
			description: t.String(),
			id: t.String(),
			originFinancialAccountId: t.String(),
			paymentCreditCardId: t.String(),
			type: t.Literal("EXPENSE"),
		},
		{ additionalProperties: true },
	),
});
