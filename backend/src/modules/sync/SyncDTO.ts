import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";
import { CreditBookDTO } from "~/modules/creditCards/infra/elysia/CreditBookDTO";
import { MonthlyBudgetReturn, SyncMonthlyBudget } from "~/modules/monthly-budgets/infra/MonthlyBudgetsDTO";
import { RecurrenceBody, RecurrenceReturn } from "~/modules/recurring/infra/elysia/RecurrenceDTO";
import * as contracts from "~/shared/infra/elysia/transport-contracts";

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

const SyncCategory = t.Object({ ...contracts.CategoryReturn.properties });
const SyncCard = t.Object({
	...t.Omit(contracts.CreditCardReturn, ["currentStatement", "limit"]).properties,
});
const SyncOccurrence = t.Object({
	date: t.String(),
	deletedAt: t.Optional(t.String()),
	id: t.String(),
	purchaseId: t.Optional(t.String()),
	recurrenceId: t.String(),
	transactionId: t.Optional(t.String()),
});
const SyncAccount = t.Object({
	...contracts.FinancialAccountReturn.properties,
	initialBalance: t.Optional(t.Number()),
});
const SyncPerson = t.Object({
	...contracts.DebtPersonReturn.properties,
	hiddenAt: t.Optional(t.Nullable(t.String())),
});

export const SyncLoanScenario = t.Object({
	id: t.String({ maxLength: 36, minLength: 1 }),
	name: t.String({ maxLength: 150, minLength: 1 }),
	parameters: t.Unknown(),
	summary: t.Unknown(),
	updatedAt: t.Optional(t.String()),
});

export const SyncBody = t.Object(
	{
		categories: t.Optional(t.Array(SyncCategory)),
		creditBooks: t.Optional(t.Array(CreditBookDTO)),
		creditCardStatements: t.Optional(t.Array(contracts.CreditCardStatementReturn)),
		creditCards: t.Optional(t.Array(SyncCard)),
		debtEvents: t.Optional(t.Array(SyncDebtEvent)),
		debtPeople: t.Optional(t.Array(SyncPerson)),
		financialAccounts: t.Optional(t.Array(SyncAccount)),
		financialAccountYieldHolidays: t.Optional(t.Array(contracts.FinancialAccountYieldHolidayReturn)),
		financialAccountYields: t.Optional(t.Array(contracts.FinancialAccountYieldReturn)),
		loanPayments: t.Optional(t.Array(contracts.LoanPaymentReturn)),
		loanScenarios: t.Optional(t.Array(SyncLoanScenario)),
		loans: t.Optional(t.Array(contracts.LoanReturn)),
		monthlyBudgets: t.Optional(t.Array(SyncMonthlyBudget)),
		recurrenceOccurrences: t.Optional(t.Array(SyncOccurrence)),
		recurrences: t.Optional(t.Array(SyncRecurrence)),
		transactions: t.Optional(t.Array(contracts.TransactionReturn)),
	},
	{ additionalProperties: false },
);
export type SyncBody = typeof SyncBody.static;

export const SyncReturn = t.Object({
	serverData: t.Object({
		categories: t.Array(SyncCategory),
		creditBooks: t.Array(CreditBookDTO),
		creditCardStatements: t.Array(contracts.CreditCardStatementReturn),
		creditCards: t.Array(SyncCard),
		debtEvents: t.Array(SyncDebtEvent),
		debtPeople: t.Array(SyncPerson),
		financialAccounts: t.Array(SyncAccount),
		financialAccountYieldHolidays: t.Array(contracts.FinancialAccountYieldHolidayReturn),
		financialAccountYields: t.Array(contracts.FinancialAccountYieldReturn),
		loanPayments: t.Array(contracts.LoanPaymentReturn),
		loanScenarios: t.Optional(t.Array(SyncLoanScenario)),
		loans: t.Array(contracts.LoanReturn),
		monthlyBudgets: t.Array(MonthlyBudgetReturn),
		recurrenceOccurrences: t.Array(SyncOccurrence),
		recurrences: t.Array(RecurrenceReturn),
		transactions: t.Array(contracts.TransactionReturn),
	}),
	syncResults: t.Record(t.String(), t.Object({ errors: t.Array(t.String()), synced: t.Number() })),
});
export type SyncReturn = typeof SyncReturn.static;

export { Id };

/** Validate serialized SQL values at the transport boundary, retaining extra fields. */
export function serializeSyncReturn(input: unknown): SyncReturn {
	const json: unknown = JSON.parse(JSON.stringify(input));
	return Value.Decode(SyncReturn, Value.Convert(SyncReturn, json));
}
