import { describe, expect, test } from "bun:test";
import {
	type CreditRefund,
	calculateRefundEffects,
	createCreditRefund,
	editCreditRefund,
	isGenericImportedRefund,
	matchingGenericRefundSource,
	refundAmountCents,
	resolveRefundPolicy,
	selectRefundInstallments,
} from "./credit-refund";

const purchase = { id: "purchase", totalAmountCents: 30000 };
const invoices = [
	{ id: "august", statementDate: "2024-08-15" },
	{ id: "september", statementDate: "2024-09-15" },
	{ id: "october", statementDate: "2024-10-15" },
];
const installments = [
	{ amountCents: 10000, number: 1, statementId: "august" },
	{ amountCents: 10000, number: 2, statementId: "september" },
	{ amountCents: 10000, number: 3, statementId: "october" },
];
const fullRefund: CreditRefund = {
	amountCents: 30000,
	cancellationEligible: true,
	creditDate: "2024-08-20",
	creditStatementId: "august",
	id: "refund",
	policy: "CANCEL_FUTURE_INSTALLMENTS",
	purchaseId: "purchase",
};

describe("purchase refunds", () => {
	test("caps multiple partial refunds in cents", () => {
		expect(refundAmountCents(30000, [9999, 10000])).toBe(10001);
		expect(() => refundAmountCents(30000, [9999, 10000], 10002)).toThrow();
		expect(() => refundAmountCents(30000, [30000], 1)).toThrow();
	});

	test("full refund cancels only later invoice cycles and credits the difference", () => {
		expect(calculateRefundEffects(purchase, [fullRefund], installments, invoices)).toEqual([
			{
				canceledAmountCents: 20000,
				canceledInstallmentNumbers: [2, 3],
				creditAmountCents: 10000,
				refundId: "refund",
			},
		]);
		expect(
			calculateRefundEffects(
				purchase,
				[{ ...fullRefund, creditStatementId: "september" }],
				installments,
				invoices,
			)[0],
		).toMatchObject({ canceledAmountCents: 10000, creditAmountCents: 20000 });
	});

	test("partial then remaining full amount never triggers cancellation", () => {
		const first = createCreditRefund(purchase, [], {
			amountCents: 10000,
			creditDate: "2024-08-20",
			creditStatementId: "august",
			hasPreviousRefundHistory: false,
			id: "first",
			policy: "KEEP_INSTALLMENTS",
		});
		const second = createCreditRefund(purchase, [first], {
			amountCents: 20000,
			creditDate: "2024-09-20",
			creditStatementId: "september",
			hasPreviousRefundHistory: true,
			id: "second",
			policy: "CANCEL_FUTURE_INSTALLMENTS",
		});
		expect(second.cancellationEligible).toBe(false);
		expect(calculateRefundEffects(purchase, [first, second], installments, invoices)).toEqual([
			expect.objectContaining({ canceledAmountCents: 0, creditAmountCents: 10000 }),
			expect.objectContaining({ canceledAmountCents: 0, creditAmountCents: 20000 }),
		]);
	});

	test("editing is atomic in value and cycle, independent of invoice paid state", () => {
		const edited = editCreditRefund(purchase, [fullRefund], "refund", {
			creditDate: "2024-09-20",
			creditStatementId: "september",
		});
		expect(calculateRefundEffects(purchase, [edited], installments, invoices)[0]).toMatchObject({
			canceledAmountCents: 10000,
			creditAmountCents: 20000,
		});
		expect(() => editCreditRefund(purchase, [fullRefund], "refund", { amountCents: 30001 })).toThrow();
	});

	test("institution policy is write-once; institution-less card prompts each full refund", () => {
		expect(
			resolveRefundPolicy({
				institutionId: "bank",
				needsCancellationDecision: true,
				requestedPolicy: "CANCEL_FUTURE_INSTALLMENTS",
				savedPolicy: null,
			}),
		).toEqual({ policy: "CANCEL_FUTURE_INSTALLMENTS", saveInstitutionPolicy: true });
		expect(() =>
			resolveRefundPolicy({ institutionId: null, needsCancellationDecision: true, savedPolicy: null }),
		).toThrow();
		expect(() =>
			resolveRefundPolicy({
				institutionId: "bank",
				needsCancellationDecision: true,
				requestedPolicy: "KEEP_INSTALLMENTS",
				savedPolicy: "CANCEL_FUTURE_INSTALLMENTS",
			}),
		).toThrow();
		expect(
			resolveRefundPolicy({
				institutionId: "bank",
				needsCancellationDecision: false,
				savedPolicy: null,
			}),
		).toMatchObject({ policy: "KEEP_INSTALLMENTS", saveInstitutionPolicy: false });
	});
});

describe("automatic refund installment selection", () => {
	const installments = Array.from({ length: 11 }, (_, index) => ({
		amountCents: 5336,
		number: index + 1,
		statementId: `statement-${index}`,
	}));
	test("refund value cancels four last or first installments and leaves surplus", () => {
		expect(selectRefundInstallments(installments, 23708, "LAST")).toEqual([8, 9, 10, 11]);
		expect(selectRefundInstallments(installments, 23708, "FIRST")).toEqual([1, 2, 3, 4]);
		expect(selectRefundInstallments(installments, 21344, "LAST")).toEqual([8, 9, 10, 11]);
	});
	test("selection follows order without skipping a more expensive installment", () => {
		const uneven = [
			{ amountCents: 5000, number: 1, statementId: "a" },
			{ amountCents: 10000, number: 2, statementId: "b" },
			{ amountCents: 5000, number: 3, statementId: "c" },
		];
		expect(selectRefundInstallments(uneven, 10000, "FIRST")).toEqual([1]);
		expect(selectRefundInstallments(uneven, 10000, "LAST")).toEqual([3]);
		expect(selectRefundInstallments(uneven, 4999, "LAST")).toEqual([]);
	});
	test("settled installments are unavailable and zero value cancels nothing", () => {
		expect(
			selectRefundInstallments(
				installments.map(item => ({ ...item, isSettled: item.number === 11 })),
				10672,
				"LAST",
			),
		).toEqual([9, 10]);
		expect(selectRefundInstallments(installments, 0, "FIRST")).toEqual([]);
	});
});

test("generic import labels identify refunds without classifying financial credits", () => {
	for (const label of [
		"Crédito concedido",
		"  CRÉDITO  CONCEDIDO  ",
		"Reembolso - Crédito concedido",
		"Estorno",
		"Reembolso",
	])
		expect(isGenericImportedRefund(label)).toBe(true);
	for (const label of [
		"Cashback",
		"Crédito parcelamento",
		"Crédito pessoal",
		"Limite de crédito",
		"Pagamento",
		"Crédito LOJA",
	])
		expect(isGenericImportedRefund(label)).toBe(false);
});

test("generic import matching rejects ambiguity, future purchases, insufficient balance and partial totals", () => {
	const credit = {
		description: "Crédito concedido",
		installmentAmount: -257.8,
		purchaseDate: "2026-10-10",
	};
	const before = { id: "before", purchaseDate: "2026-10-08", refundableAmount: 257.8, totalAmount: 257.8 };
	const after = { ...before, id: "after", purchaseDate: "2026-10-12" };
	expect(matchingGenericRefundSource(credit, [before, after])).toBe(before);
	expect(matchingGenericRefundSource(credit, [before, { ...before, id: "other" }])).toBeUndefined();
	for (const source of [after, { ...before, totalAmount: 300 }, { ...before, refundableAmount: 100 }])
		expect(matchingGenericRefundSource(credit, [source])).toBeUndefined();
	for (const amount of [0, 257.8, Number.NaN, Number.NEGATIVE_INFINITY])
		expect(
			matchingGenericRefundSource({ ...credit, installmentAmount: amount }, [before]),
		).toBeUndefined();
});
