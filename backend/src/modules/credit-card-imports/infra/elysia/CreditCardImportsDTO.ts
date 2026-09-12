import { t } from "elysia";

export const CreditCardImportItemUpdateDTO = t.Object({
	currentInstallment: t.Optional(t.Number({ maximum: 48, minimum: 1 })),
	description: t.Optional(t.String({ maxLength: 500, minLength: 1 })),
	installments: t.Optional(t.Number({ maximum: 48, minimum: 1 })),
	isSelected: t.Optional(t.Boolean()),
	purchaseDate: t.Optional(t.String()),
	storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
	tagIds: t.Optional(t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 20 })),
	totalAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});
