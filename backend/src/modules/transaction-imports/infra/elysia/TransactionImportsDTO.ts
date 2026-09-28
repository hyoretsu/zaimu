import { t } from "elysia";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";

export const TransactionImportItemUpdateDTO = t.Object({
	amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
	categoryId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
	date: t.Optional(t.String()),
	debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
	description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
	destinationFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
	isDuplicateIgnored: t.Optional(t.Boolean()),
	isHidden: t.Optional(t.Boolean()),
	isSelected: t.Optional(t.Boolean()),
	originFinancialAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
	paymentCreditCardId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
	storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
	tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }))),
	time: t.Optional(t.Nullable(t.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" }))),
	type: t.Optional(
		t.Union([t.Literal("INCOME"), t.Literal("EXPENSE"), t.Literal("TRANSFER"), t.Literal("YIELD")]),
	),
});

export const TransactionImportItemReconcileDTO = t.Object({
	duplicateId: t.String({ maxLength: 36, minLength: 1 }),
	duplicateSource: t.Union([t.Literal("IMPORT_ITEM"), t.Literal("TRANSACTION")]),
	sources: t.Partial(
		t.Object({
			amount: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			date: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			debtSplit: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			description: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			destinationFinancialAccountId: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			originFinancialAccountId: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			storeName: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			tagIds: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			time: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
			type: t.Union([t.Literal("duplicate"), t.Literal("imported")]),
		}),
	),
});
