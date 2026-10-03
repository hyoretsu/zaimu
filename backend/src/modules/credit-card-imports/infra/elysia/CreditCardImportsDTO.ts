import { t } from "elysia";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";

export const CreditCardImportItemUpdateDTO = t.Object({
	debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
	description: t.Optional(t.String({ maxLength: 500 })),
	dueDate: t.Optional(t.String({ format: "date" })),
	installments: t.Optional(t.Number({ maximum: 48, minimum: 1 })),
	isSelected: t.Optional(t.Boolean()),
	isStatementCharge: t.Optional(t.Boolean()),
	purchaseDate: t.Optional(t.String()),
	statementDate: t.Optional(t.String({ format: "date" })),
	storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
	tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
	time: t.Optional(t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" }))),
	totalAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});

export const CreditCardImportItemReconcileDTO = t.Object({
	creditPurchaseId: t.String({ maxLength: 36, minLength: 1 }),
	sources: t.Optional(
		t.Partial(
			t.Object({
				debtSplit: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
				description: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
				purchaseDate: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
				storeName: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
				tagIds: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
				time: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			}),
		),
	),
});
