import { t } from "elysia";
import { FinancialAccountReturn } from "~/shared/infra/elysia/transport-contracts";
import { PeriodReturn } from "./dashboard-dtos";

const ForecastReturn = t.Object({
	amount: t.Number(),
	date: t.String(),
	direction: t.Union([t.Literal("INCOME"), t.Literal("EXPENSE")]),
	id: t.String(),
	name: t.String(),
	sourceId: t.String(),
	type: t.Union([
		t.Literal("CARD"),
		t.Literal("LOAN"),
		t.Literal("RECURRING"),
		t.Literal("SALARY"),
		t.Literal("SUBSCRIPTION"),
		t.Literal("TRANSACTION"),
	]),
});
export const DashboardReturn = t.Object({
	accounts: t.Array(
		t.Object({
			balance: t.Number(),
			currency: t.String(),
			id: t.String(),
			institutionName: t.Nullable(t.String()),
			name: t.Nullable(t.String()),
			type: t.Union([FinancialAccountReturn.properties.type, t.Literal("CASHBACK")]),
		}),
	),
	balanceBreakdown: t.Nullable(
		t.Object({
			accountBalance: t.Number(),
			fixedIncomeBalance: t.Number(),
			savingsBalance: t.Number(),
			variableIncomeBalance: t.Number(),
		}),
	),
	consolidation: t.Object({
		forecastAvailable: t.Boolean(),
		histories: t.Array(
			t.Object({
				collectionId: t.String(),
				coveredDays: t.Number(),
				endDate: t.String(),
				requestedDays: t.Number(),
				startDate: t.String(),
				state: t.String(),
			}),
		),
		method: t.Literal("EXPONENTIAL_90_DAY_HALF_LIFE"),
		publishedDates: t.Record(t.String(), t.String()),
		unavailable: t.Boolean(),
	}),
	creditCards: t.Array(
		t.Object({
			availableLimit: t.Number(),
			creditLimit: t.Number(),
			currency: t.String(),
			excludeFromTotals: t.Boolean(),
			financialAccountId: t.String(),
			id: t.String(),
			institutionName: t.Nullable(t.String()),
			name: t.Nullable(t.String()),
			statement: t.Nullable(t.Object({ balanceAmount: t.Number(), dueDate: t.String(), id: t.String() })),
		}),
	),
	currency: t.String(),
	dailyBalances: t.Array(t.Object({ balance: t.Number(), date: t.String() })),
	debts: t.Nullable(
		t.Object({
			iOwe: t.Number(),
			net: t.Number(),
			owedToMe: t.Number(),
			people: t.Array(
				t.Object({
					balance: t.Number(),
					direction: t.Union([t.Literal("OWED"), t.Literal("OWES")]),
					id: t.String(),
					name: t.String(),
				}),
			),
		}),
	),
	forecasts: t.Array(ForecastReturn),
	nativeAsOf: t.String(),
	period: t.Nullable(PeriodReturn),
	projectedCashFlowUntilMonthEnd: t.Nullable(
		t.Object({
			expenses: t.Number(),
			income: t.Number(),
			net: t.Number(),
			recurringExpenses: t.Number(),
			recurringIncome: t.Number(),
		}),
	),
	referenceRatesAvailable: t.Boolean(),
	totalAvailableCredit: t.Nullable(t.Number()),
});
export type DashboardReturn = typeof DashboardReturn.static;
