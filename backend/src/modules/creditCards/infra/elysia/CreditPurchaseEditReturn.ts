import { t } from "elysia";
import { DebtSplitReturnDTO } from "~/modules/debts/infra/elysia/DebtSplitsDTO";

export const CreditPurchaseEditReturn = t.Object({
	debtSplit: t.Union([DebtSplitReturnDTO, t.Null()]),
	externalId: t.Union([t.String(), t.Null()]),
	feeAmount: t.Union([t.Number(), t.Null()]),
	id: t.String(),
	installmentImportedNumbers: t.Array(t.Integer()),
	purchaseDate: t.String(),
	totalAmountCents: t.Integer(),
});
export type CreditPurchaseEditReturn = typeof CreditPurchaseEditReturn.static;
