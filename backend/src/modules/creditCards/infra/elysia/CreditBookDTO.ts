import { t } from "elysia";
import { FinancialFeeDTO } from "~/modules/currencies/application/financial-money";
import { DebtSplitInputDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";

const Id = t.String({ maxLength: 36, minLength: 1 });
const DateKey = t.String({ format: "date" });
const NullableId = t.Nullable(Id);
const Cents = t.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 });
export const RefundPolicyDTO = t.Union([
	t.Literal("KEEP_INSTALLMENTS"),
	t.Literal("CANCEL_FUTURE_INSTALLMENTS"),
]);
export const BookPurchaseDTO = t.Object({
	cashbackAccountId: NullableId,
	cashbackAmount: t.Nullable(t.Number({ minimum: 0 })),
	cashbackYieldPeriod: t.Nullable(t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	cashbackYieldReferencePercentage: t.Nullable(t.Number()),
	cashbackYieldReferenceRate: t.Nullable(t.Number()),
	createdAt: t.String(),
	creditCardId: Id,
	currency: t.Optional(t.String()),
	debtSplitRule: t.Optional(t.Nullable(DebtSplitInputDTO)),
	description: t.String({ maxLength: 500 }),
	exchangeRate: t.Optional(t.Nullable(t.Number())),
	externalId: t.Nullable(t.String({ maxLength: 200 })),
	feeAmount: t.Nullable(t.Number({ minimum: 0 })),
	feeDescription: t.Nullable(t.String()),
	fees: t.Optional(t.Array(FinancialFeeDTO)),
	id: Id,
	installmentAmountsCents: t.Array(t.Integer({ minimum: 1 }), { maxItems: 48, minItems: 1 }),
	installmentImportedNumbers: t.Optional(t.Array(t.Integer({ maximum: 48, minimum: 1 }))),
	installmentStatementDates: t.Optional(
		t.Array(t.Nullable(t.Object({ dueDate: DateKey, statementDate: DateKey }))),
	),
	originalAmount: t.Optional(t.Nullable(t.Number())),
	purchaseDate: DateKey,
	recurrenceId: NullableId,
	recurrenceOccurrenceDate: t.Nullable(DateKey),
	refinancingFeeAmount: t.Nullable(t.Number({ minimum: 0 })),
	storeName: t.Nullable(t.String({ maxLength: 200 })),
	tagIds: t.Array(Id, { maxItems: 20 }),
	time: t.Nullable(t.String()),
	totalAmountCents: Cents,
	updatedAt: t.String(),
	userId: Id,
});
export const BookRefundDTO = t.Object({
	amountCents: t.Integer({ minimum: 1 }),
	cancellationEligible: t.Boolean(),
	createdAt: t.String(),
	creditDate: DateKey,
	creditStatementId: Id,
	deletedAt: t.Nullable(t.String()),
	externalId: t.Optional(t.Nullable(t.String())),
	id: Id,
	policy: RefundPolicyDTO,
	purchaseId: Id,
	time: t.Optional(t.Nullable(t.String())),
	updatedAt: t.String(),
});
export const CreditBookDTO = t.Object({
	card: t.Object({
		dueDay: t.Integer({ maximum: 31, minimum: 1 }),
		id: Id,
		ignoreStatementsBefore: t.Nullable(DateKey),
		institutionId: NullableId,
		refundPolicy: t.Nullable(RefundPolicyDTO),
		statementDay: t.Integer({ maximum: 31, minimum: 1 }),
		userId: Id,
	}),
	charges: t.Array(
		t.Object({
			amountCents: t.Integer({ minimum: 1 }),
			chargeDate: DateKey,
			description: t.String({ maxLength: 500 }),
			externalId: t.Nullable(t.String()),
			id: Id,
			isSettled: t.Boolean(),
			settledByPurchaseId: NullableId,
			statementId: Id,
			time: t.Nullable(t.String()),
		}),
	),
	deletedChargeIds: t.Optional(t.Array(Id)),
	deletedPurchaseIds: t.Optional(t.Array(Id)),
	installments: t.Array(
		t.Object({
			amountCents: t.Integer({ minimum: 1 }),
			hasImportedAmount: t.Boolean(),
			id: Id,
			isSettled: t.Optional(t.Boolean()),
			number: t.Integer({ maximum: 48, minimum: 1 }),
			occurrenceDate: DateKey,
			purchaseId: Id,
			settledByPurchaseId: NullableId,
			statementId: Id,
		}),
	),
	payments: t.Array(t.Object({ amount: t.Number(), date: DateKey, id: Id })),
	purchases: t.Array(BookPurchaseDTO),
	refunds: t.Array(BookRefundDTO),
	statements: t.Array(
		t.Object({
			creditCardId: Id,
			dueDate: DateKey,
			id: Id,
			isForecast: t.Optional(t.Boolean()),
			isFullySynced: t.Boolean(),
			isPaid: t.Boolean(),
			paidAmount: t.Number(),
			statementDate: DateKey,
			totalAmount: t.Number(),
		}),
	),
});
export type CreditBookDTO = typeof CreditBookDTO.static;
