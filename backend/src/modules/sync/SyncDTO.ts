import { t } from "elysia";
import { CreditBookDTO } from "~/modules/creditCards/infra/elysia/CreditBookDTO";

import { RecurrenceBody, RecurrenceReturn } from "~/modules/recurring/infra/elysia/RecurrenceDTO";

const SyncRecurrence = t.Object(
	{ ...RecurrenceReturn.properties, debtSplit: RecurrenceBody.properties.debtSplit },
	{ additionalProperties: false },
);

const Id = t.String({ maxLength: 36, minLength: 1 });
export const SyncDebtEvent = t.Object(
	{
		amount: t.Number({ exclusiveMinimum: 0 }),
		baseUpdatedAt: t.Optional(t.String({ format: "date-time" })),
		createdAt: t.String({ format: "date-time" }),
		currency: t.Optional(t.String({ pattern: "^[A-Z]{3}$" })),
		date: t.Nullable(t.String({ format: "date" })),
		debtPersonId: Id,
		deletedAt: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
		description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
		dueDate: t.Optional(t.Nullable(t.String({ format: "date" }))),
		effect: t.Number(),
		id: Id,
		kind: t.Union([t.Literal("ORIGIN"), t.Literal("MIGRATED_SETTLEMENT")]),
		updatedAt: t.String({ format: "date-time" }),
		upgradeRecordId: t.Optional(Id),
	},
	{ additionalProperties: false },
);
export type SyncDebtEvent = typeof SyncDebtEvent.static;

const Entity = t.Record(t.String(), t.Unknown());

export const SyncBody = t.Object(
	{
		categories: t.Optional(t.Array(Entity)),
		creditBooks: t.Optional(t.Array(CreditBookDTO)),
		creditCardStatements: t.Optional(t.Array(Entity)),
		creditCards: t.Optional(t.Array(Entity)),
		debtEvents: t.Optional(t.Array(SyncDebtEvent)),
		debtPeople: t.Optional(t.Array(Entity)),
		financialAccounts: t.Optional(t.Array(Entity)),
		financialAccountYieldHolidays: t.Optional(t.Array(Entity)),
		financialAccountYields: t.Optional(t.Array(Entity)),
		loanPayments: t.Optional(t.Array(Entity)),
		loans: t.Optional(t.Array(Entity)),
		recurrenceOccurrences: t.Optional(t.Array(Entity)),
		recurrences: t.Optional(t.Array(SyncRecurrence)),
		transactions: t.Optional(t.Array(Entity)),
	},
	{ additionalProperties: false },
);
export type SyncBody = typeof SyncBody.static;

export const SyncReturn = t.Object({
	serverData: t.Object({
		categories: t.Array(Entity),
		creditBooks: t.Array(CreditBookDTO),
		creditCardStatements: t.Array(Entity),
		creditCards: t.Array(Entity),
		debtEvents: t.Array(SyncDebtEvent),
		debtPeople: t.Array(Entity),
		financialAccounts: t.Array(Entity),
		financialAccountYieldHolidays: t.Array(Entity),
		financialAccountYields: t.Array(Entity),
		loanPayments: t.Array(Entity),
		loans: t.Array(Entity),
		recurrenceOccurrences: t.Array(Entity),
		recurrences: t.Array(Entity),
		transactions: t.Array(Entity),
	}),
	syncResults: t.Record(t.String(), t.Object({ errors: t.Array(t.String()), synced: t.Number() })),
});
export type SyncReturn = typeof SyncReturn.static;

export { Id };
