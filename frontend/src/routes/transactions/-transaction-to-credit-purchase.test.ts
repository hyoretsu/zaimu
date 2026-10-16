import { describe, expect, test } from "bun:test";
import type { Transaction } from "@/lib/api";
import { transactionToCreditPurchase } from "./-transaction-to-credit-purchase";

describe("transactionToCreditPurchase", () => {
	test("preserva referência da dívida usada pelo modal de compra", () => {
		const transaction: Transaction = {
			amount: 2480,
			createdAt: "2026-07-17T12:00:00.000Z",
			currentInstallment: 1,
			date: "2026-07-17",
			debtSplit: {
				mode: "SHARES",
				ownerAmount: 0,
				ownerShares: null,
				participants: [{ amount: 2480, debtPersonId: "person-id", debtPersonName: "Ana", shares: 1 }],
			},
			description: "iPhone 17",
			id: "purchase-id",
			installmentAmount: 248,
			installments: 10,
			isFullySynced: false,
			isSynced: true,
			parentId: "original-purchase",
			paymentCreditCardId: undefined,
			source: "CREDIT_CARD",
			statementId: "statement-id",
			type: "EXPENSE",
		};

		expect(transactionToCreditPurchase(transaction)).toMatchObject({
			debtSplit: expect.objectContaining({ mode: "SHARES" }),
			id: "original-purchase",
			installments: 10,
			isFullySynced: false,
			isSynced: true,
			parentId: undefined,
			statementId: "statement-id",
		});
	});
});
