import { t } from "elysia";
import { DebtSplitInputDTO, DebtSplitReturnDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";

const Id = t.String({ maxLength: 36, minLength: 1 });
const NullableId = t.Nullable(Id);
const DateString = t.String({ format: "date" });
export const RecurrenceBody = t.Object({
	amount: t.Number({ exclusiveMinimum: 0, maximum: 9999999999.99 }),
	creditCardId: t.Optional(NullableId),
	dayOfMonth: t.Optional(t.Nullable(t.Integer({ maximum: 31, minimum: 1 }))),
	dayOfWeek: t.Optional(t.Nullable(t.Integer({ maximum: 6, minimum: 0 }))),
	debtSplit: t.Optional(t.Nullable(DebtSplitInputDTO)),
	destinationFinancialAccountId: t.Optional(NullableId),
	endDate: t.Optional(t.Nullable(DateString)),
	interval: t.Integer({ maximum: 10000, minimum: 1 }),
	isActive: t.Optional(t.Boolean()),
	movement: t.Union([
		t.Literal("INCOME"),
		t.Literal("EXPENSE"),
		t.Literal("TRANSFER"),
		t.Literal("CARD_PURCHASE"),
		t.Literal("CARD_PAYMENT"),
	]),
	name: t.String({ maxLength: 100, minLength: 1 }),
	originFinancialAccountId: t.Optional(NullableId),
	startDate: DateString,
	storeName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
	tagIds: t.Optional(t.Array(Id, { maxItems: 20 })),
	unit: t.Union([t.Literal("DAY"), t.Literal("WEEK"), t.Literal("MONTH"), t.Literal("YEAR")]),
});
export type RecurrenceBody = typeof RecurrenceBody.static;
export const UpdateRecurrenceBody = t.Partial(RecurrenceBody);
export type UpdateRecurrenceBody = typeof UpdateRecurrenceBody.static;
// Presentation includes computed debt split plus tag metadata supplied by existing domain helpers.
export const RecurrenceReturn = t.Object({
	...RecurrenceBody.properties,
	createdAt: t.String(),
	debtSplit: t.Nullable(DebtSplitReturnDTO),
	id: Id,
	isActive: t.Boolean(),
	legacyId: t.Optional(NullableId),
	legacySource: t.Optional(t.Nullable(t.String())),
	materializedThrough: DateString,
	needsConfiguration: t.Boolean(),
	tagIds: t.Array(Id),
	tags: t.Array(
		t.Object({ color: t.Nullable(t.String()), icon: t.Nullable(t.String()), id: Id, name: t.String() }),
	),
	updatedAt: t.String(),
	userId: Id,
});
export const RecurrenceHistoryReturn = t.Array(
	t.Object({
		changedAt: t.String(),
		field: t.String(),
		id: Id,
		newValue: t.Nullable(t.String()),
		oldValue: t.Nullable(t.String()),
		recurrenceId: Id,
	}),
);
export const RecurrenceSuccessReturn = t.Object({ success: t.Literal(true) });
export const ReplayRecurrenceBody = t.Object({ from: DateString, through: DateString });
export const ReplayRecurrenceReturn = t.Object({ created: t.Integer({ minimum: 0 }) });

/** Transition body accepted by former recurring-payment clients. */
export const LegacyRecurringBody = t.Object({
	amount: RecurrenceBody.properties.amount,
	day: t.Optional(t.Nullable(t.Integer({ maximum: 31, minimum: 1 }))),
	dayOfMonth: RecurrenceBody.properties.dayOfMonth,
	dayOfWeek: RecurrenceBody.properties.dayOfWeek,
	debtSplit: RecurrenceBody.properties.debtSplit,
	endDate: RecurrenceBody.properties.endDate,
	financialAccountId: t.Optional(NullableId),
	frequency: t.Optional(
		t.Union([
			t.Literal("DAILY"),
			t.Literal("WEEKLY"),
			t.Literal("BIWEEKLY"),
			t.Literal("MONTHLY"),
			t.Literal("YEARLY"),
		]),
	),
	isActive: RecurrenceBody.properties.isActive,
	name: RecurrenceBody.properties.name,
	paymentMethod: t.Optional(t.String()),
	startDate: DateString,
	storeName: RecurrenceBody.properties.storeName,
	tagIds: RecurrenceBody.properties.tagIds,
});
