import { t } from "elysia";
const DateOnly = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const Money = t.Number({ minimum: 0 });
export const FinancialRateRuleDTO = t.Object({
	basis: t.Optional(t.Union([t.Literal("CALENDAR_365"), t.Literal("BUSINESS_252")])),
	fixedPeriod: t.Optional(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	fixedRate: t.Optional(t.Nullable(Money)),
	indicator: t.Optional(
		t.Nullable(t.Union([t.Literal("CDI"), t.Literal("SELIC"), t.Literal("IPCA"), t.Literal("TR")])),
	),
	lagMonths: t.Optional(t.Integer({ maximum: 24, minimum: 0 })),
	negativeFloor: t.Optional(t.Boolean()),
	percentage: t.Optional(t.Nullable(Money)),
});
export const LoanContractTermsDTO = t.Object({
	amortization: t.Union([t.Literal("PRICE"), t.Literal("SAC"), t.Literal("MANUAL")]),
	charges: t.Array(
		t.Object({
			amount: Money,
			financed: t.Boolean(),
			name: t.String({ maxLength: 150, minLength: 1 }),
			recurring: t.Boolean(),
		}),
		{ maxItems: 100 },
	),
	currency: t.String({ maxLength: 3, minLength: 3 }),
	discount: t.Union([t.Literal("PRESENT_VALUE"), t.Literal("NO_DISCOUNT")]),
	firstDueDate: DateOnly,
	graceInterest: t.Union([t.Literal("PAY"), t.Literal("CAPITALIZE")]),
	graceMonths: t.Integer({ maximum: 1199, minimum: 0 }),
	lateFinePercent: Money,
	lateMonthlyPercent: Money,
	manualSchedule: t.Optional(
		t.Array(t.Object({ charges: Money, dueDate: DateOnly, interest: t.Number(), principal: Money }), {
			maxItems: 1200,
		}),
	),
	principalAmount: t.Number({ exclusiveMinimum: 0 }),
	rate: FinancialRateRuleDTO,
	startDate: DateOnly,
	totalInstallments: t.Integer({ maximum: 1200, minimum: 1 }),
});
export type LoanContractTermsDTO = typeof LoanContractTermsDTO.static;
const InstallmentDTO = t.Object({
	balance: t.Number(),
	charges: Money,
	dueDate: DateOnly,
	id: t.String(),
	interest: t.Number(),
	number: t.Integer(),
	principal: Money,
});
const AllocationDTO = t.Object({
	charges: Money,
	discount: t.Number(),
	installmentId: t.String(),
	interest: t.Number(),
	principal: Money,
});
export const LoanReceiptDTO = t.Object({
	accountAmount: t.Nullable(t.Number()),
	accountCurrency: t.Nullable(t.String()),
	accountId: t.Nullable(t.String()),
	allocations: t.Array(AllocationDTO),
	amount: t.Number(),
	date: DateOnly,
	id: t.String(),
	kind: t.Union([
		t.Literal("PAYMENT"),
		t.Literal("ADVANCE"),
		t.Literal("PAYOFF"),
		t.Literal("REVERSAL"),
		t.Literal("REFINANCE"),
	]),
	lateCharges: t.Number(),
	reversesId: t.Optional(t.String()),
});
export const LoanContractBookDTO = t.Object({
	disbursementTransactionId: t.Optional(t.Nullable(t.String())),
	institutionId: t.Nullable(t.String()),
	loanId: t.String(),
	predecessorLoanId: t.Optional(t.Nullable(t.String())),
	receipts: t.Array(LoanReceiptDTO),
	revision: t.Integer({ minimum: 1 }),
	successorLoanId: t.Optional(t.Nullable(t.String())),
	versions: t.Array(
		t.Object({
			effectiveDate: DateOnly,
			reason: t.Union([
				t.Literal("CREATE"),
				t.Literal("EDIT"),
				t.Literal("ADVANCE"),
				t.Literal("RENEGOTIATE"),
				t.Literal("PORTABILITY"),
				t.Literal("REVERSAL"),
			]),
			receiptId: t.Optional(t.String()),
			revision: t.Integer(),
			schedule: t.Array(InstallmentDTO),
			terms: LoanContractTermsDTO,
		}),
	),
});
export const LoanSimulationInputDTO = t.Object({
	amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
	count: t.Optional(t.Integer({ maximum: 1200, minimum: 1 })),
	date: DateOnly,
	installmentIds: t.Optional(t.Array(t.String(), { maxItems: 1200 })),
	mode: t.Union([
		t.Literal("FRONT"),
		t.Literal("BACK"),
		t.Literal("SELECTED"),
		t.Literal("REDUCE_TERM"),
		t.Literal("REDUCE_PAYMENT"),
		t.Literal("PAYOFF"),
	]),
	quotedAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});
export const LoanSimulationReturn = t.Object({
	afterMaturity: DateOnly,
	afterTotal: t.Number(),
	allocations: t.Array(AllocationDTO),
	amount: t.Number(),
	beforeMaturity: DateOnly,
	beforeTotal: t.Number(),
	charges: t.Number(),
	currency: t.String(),
	discount: t.Number(),
	input: LoanSimulationInputDTO,
	interestSaved: t.Number(),
	revision: t.Integer(),
	schedule: t.Array(InstallmentDTO),
});
export const LoanBookingDTO = t.Object({
	accountAmount: t.Nullable(t.Number({ minimum: 0 })),
	accountId: t.Nullable(t.String({ maxLength: 36, minLength: 1 })),
	id: t.String({ maxLength: 36, minLength: 1 }),
});
