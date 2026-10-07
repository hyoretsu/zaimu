import { t } from "elysia";
import { FinancialFeeDTO } from "~/modules/currencies/application/financial-money";
import { DebtSplitReturnDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";

export const CreditPurchaseEditReturn = t.Object({
	currency: t.Optional(t.String()),
	debtSplit: t.Union([DebtSplitReturnDTO, t.Null()]),
	exchangeRate: t.Optional(t.Nullable(t.Number())),
	externalId: t.Union([t.String(), t.Null()]),
	feeAmount: t.Union([t.Number(), t.Null()]),
	fees: t.Optional(t.Array(FinancialFeeDTO)),
	id: t.String(),
	installmentImportedNumbers: t.Array(t.Integer()),
	originalAmount: t.Optional(t.Nullable(t.Number())),
	purchaseDate: t.String(),
	totalAmountCents: t.Integer(),
});
export type CreditPurchaseEditReturn = typeof CreditPurchaseEditReturn.static;
