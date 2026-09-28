import { expect, test } from "bun:test";
import type { CreditPurchase } from "./credit-purchase";
import type { CreditRefund } from "./credit-refund";
import { rebuildPurchaseStatementLedger } from "./purchase-statement-ledger";

const purchase: CreditPurchase = {
	categoryId: null,
	creditCardId: "card",
	description: "Compra",
	id: "purchase",
	installmentAmountsCents: [10000, 10000, 10000],
	purchaseDate: "2024-08-10",
	storeName: "Loja",
	tagIds: [],
	totalAmountCents: 30000,
};
const statements = ["08", "09", "10"].map(month => ({
	chargesAmount: 0,
	dueDate: `2024-${month}-25`,
	id: month,
	paidAmount: 999,
	statementDate: `2024-${month}-15`,
	totalAmount: 999,
}));
const installments = statements.map((statement, index) => ({
	amountCents: 10000,
	number: index + 1,
	purchaseId: purchase.id,
	statementId: statement.id,
}));
const refund: CreditRefund = {
	amountCents: 30000,
	cancellationEligible: true,
	creditDate: "2024-08-20",
	creditStatementId: "08",
	id: "refund",
	policy: "CANCEL_FUTURE_INSTALLMENTS",
	purchaseId: purchase.id,
};

test("rebuilds invoice chain without counting purchase total and installments twice", () => {
	const result = rebuildPurchaseStatementLedger({
		asOf: "2024-10-25",
		installments,
		payments: [],
		purchases: [purchase],
		refunds: [refund],
		statements,
	});
	expect(result.statements.map(statement => statement.totalAmount)).toEqual([0, 0, 0]);
	expect(result.refundEffects[0]).toMatchObject({ canceledAmountCents: 20000, creditAmountCents: 10000 });
});

test("editing refund in paid invoice reopens chain and preserves actual payment credit", () => {
	const common = { asOf: "2024-08-25", installments, purchases: [purchase], statements };
	const payment = [{ amount: 100, date: "2024-08-25" }];
	const full = rebuildPurchaseStatementLedger({ ...common, payments: payment, refunds: [refund] });
	expect(full.statements[0]).toMatchObject({ isPaid: true, totalAmount: 0 });
	expect(full.statements[1]).toMatchObject({ balanceAmount: 0, creditInAmount: 100 });
	const edited = { ...refund, amountCents: 5000, cancellationEligible: false };
	const partial = rebuildPurchaseStatementLedger({ ...common, payments: [], refunds: [edited] });
	expect(partial.statements[0]).toMatchObject({ balanceAmount: 50, isPaid: false, totalAmount: 50 });
	expect(partial.statements.map(statement => statement.totalAmount)).toEqual([50, 100, 100]);
	expect(refund.amountCents).toBe(30000);
});

test("future refunds cannot change a historical query", () => {
	const result = rebuildPurchaseStatementLedger({
		asOf: "2024-08-19",
		installments,
		payments: [],
		purchases: [purchase],
		refunds: [refund],
		statements,
	});
	expect(result.statements.map(statement => statement.totalAmount)).toEqual([100, 100, 100]);
	expect(result.refundEffects).toEqual([]);
});

test("keeps real charges while canceling future principal", () => {
	const result = rebuildPurchaseStatementLedger({
		asOf: "2024-08-25",
		installments,
		payments: [],
		purchases: [purchase],
		refunds: [refund],
		statements: statements.map(statement => ({ ...statement, chargesAmount: 12 })),
	});
	expect(result.statements.map(statement => statement.chargesAmount)).toEqual([12, 12, 12]);
	expect(result.statements[0]?.amountDue).toBe(12);
});

test("surplus refund credit and other purchases are order independent", () => {
	const other = { ...purchase, id: "other", installmentAmountsCents: [5000], totalAmountCents: 5000 };
	const otherInstallment = { amountCents: 5000, number: 1, purchaseId: other.id, statementId: "09" };
	const laterRefund = {
		...refund,
		creditDate: "2024-09-20",
		creditStatementId: "09",
		policy: "KEEP_INSTALLMENTS" as const,
	};
	const replay = (purchases: CreditPurchase[]) =>
		rebuildPurchaseStatementLedger({
			asOf: "2024-09-25",
			installments: [...installments, otherInstallment],
			payments: [],
			purchases,
			refunds: [laterRefund],
			statements,
		}).statements;
	expect(replay([purchase, other])).toEqual(replay([other, purchase]));
	expect(replay([purchase, other])[1]?.totalAmount).toBe(-150);
});
