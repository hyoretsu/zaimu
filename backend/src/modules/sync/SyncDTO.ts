import { t } from "elysia";
import { CreditBookDTO } from "~/modules/creditCards/infra/elysia/CreditBookDTO";

const Id = t.String({ maxLength: 36, minLength: 1 });
const Entity = t.Record(t.String(), t.Unknown());

export const SyncBody = t.Object({
	categories: t.Optional(t.Array(Entity)),
	creditBooks: t.Optional(t.Array(CreditBookDTO)),
	creditCardStatements: t.Optional(t.Array(Entity)),
	creditCards: t.Optional(t.Array(Entity)),
	debtPeople: t.Optional(t.Array(Entity)),
	debts: t.Optional(t.Array(Entity)),
	financialAccounts: t.Optional(t.Array(Entity)),
	financialAccountYieldHolidays: t.Optional(t.Array(Entity)),
	financialAccountYields: t.Optional(t.Array(Entity)),
	loans: t.Optional(t.Array(Entity)),
	recurrenceOccurrences: t.Optional(t.Array(Entity)),
	recurrences: t.Optional(t.Array(Entity)),
	recurringPayments: t.Optional(t.Array(Entity)),
	salaries: t.Optional(t.Array(Entity)),
	subscriptions: t.Optional(t.Array(Entity)),
	transactions: t.Optional(t.Array(Entity)),
});
export type SyncBody = typeof SyncBody.static;

export const SyncReturn = t.Object({
	serverData: t.Object({
		categories: t.Array(Entity),
		creditBooks: t.Array(CreditBookDTO),
		creditCardStatements: t.Array(Entity),
		creditCards: t.Array(Entity),
		debtPeople: t.Array(Entity),
		debts: t.Array(Entity),
		financialAccounts: t.Array(Entity),
		financialAccountYieldHolidays: t.Array(Entity),
		financialAccountYields: t.Array(Entity),
		loans: t.Array(Entity),
		recurrenceOccurrences: t.Array(Entity),
		recurrences: t.Array(Entity),
		recurringPayments: t.Array(Entity),
		salaries: t.Array(Entity),
		subscriptions: t.Array(Entity),
		transactions: t.Array(Entity),
	}),
	syncResults: t.Record(t.String(), t.Object({ errors: t.Array(t.String()), synced: t.Number() })),
});
export type SyncReturn = typeof SyncReturn.static;

export { Id };
