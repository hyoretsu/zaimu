import { t } from "elysia";

export const CreditStatementReturn = t.Object(
	{
		amountDue: t.Number(),
		balanceAmount: t.Number(),
		carriedInAmount: t.Number(),
		carriedOutAmount: t.Number(),
		chargesAmount: t.Number(),
		creditCardId: t.String(),
		creditInAmount: t.Number(),
		dueDate: t.String(),
		id: t.String(),
		isForecast: t.Optional(t.Boolean()),
		isFullySynced: t.Boolean(),
		isPaid: t.Boolean(),
		paidAmount: t.Number(),
		periodPaymentAmount: t.Number(),
		statementDate: t.String(),
		status: t.Union([t.Literal("OPEN"), t.Literal("PAID"), t.Literal("CARRIED")]),
		totalAmount: t.Number(),
	},
	{ additionalProperties: true },
);
export const CreditStatementPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(CreditStatementReturn),
	nextCursor: t.Nullable(t.String()),
});
export const CreditCardOverviewReturn = t.Object(
	{
		accountName: t.Nullable(t.String()),
		cashbackAccountId: t.Nullable(t.String()),
		cashbackRate: t.Nullable(t.Number()),
		cashbackYieldPeriod: t.Nullable(t.String()),
		cashbackYieldReferencePercentage: t.Nullable(t.Number()),
		cashbackYieldReferenceRate: t.Nullable(t.Number()),
		creditLimit: t.Number(),
		currentStatement: t.Nullable(
			t.Object(
				{
					balanceAmount: t.Number(),
					chargesAmount: t.Number(),
					creditCardId: t.String(),
					dueDate: t.Union([t.String(), t.Date()]),
					id: t.String(),
					paidAmount: t.Number(),
					statementDate: t.Union([t.String(), t.Date()]),
					totalAmount: t.Number(),
				},
				{ additionalProperties: true },
			),
		),
		dueDay: t.Number(),
		excludeFromTotals: t.Boolean(),
		financialAccountId: t.String(),
		id: t.String(),
		ignoreStatementsBefore: t.Nullable(t.Union([t.String(), t.Date()])),
		limit: t.Object({
			availableLimit: t.Number(),
			effectiveLimit: t.Number(),
			temporaryCredit: t.Number(),
			usedLimit: t.Number(),
		}),
		paymentAccountId: t.Nullable(t.String()),
		paymentSuggestionsEnabled: t.Boolean(),
		pendingRefundReviewCount: t.Integer({ minimum: 0 }),
		securityDeposit: t.Nullable(t.Number()),
		statementDay: t.Number(),
		workingDueDate: t.Boolean(),
	},
	{ additionalProperties: true },
);
