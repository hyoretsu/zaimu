import { t } from "elysia";

export const LoanPaymentReturn = t.Object({
	advanceType: t.Union([t.Literal("FRONT"), t.Literal("BACK"), t.Null()]),
	createdAt: t.String(),
	currency: t.String(),
	dueDate: t.String(),
	financialAccountId: t.Union([t.String(), t.Null()]),
	id: t.String(),
	installmentNumber: t.Integer(),
	interestPaid: t.Number(),
	isAdvanced: t.Boolean(),
	loanId: t.String(),
	paidDate: t.Union([t.String(), t.Null()]),
	principalPaid: t.Number(),
	totalPaid: t.Number(),
	updatedAt: t.String(),
});

export const LoanPaymentPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(LoanPaymentReturn),
	nextCursor: t.Union([t.String(), t.Null()]),
});
