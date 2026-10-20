import { describe, expect, test } from "bun:test";
import {
	matchesDuplicateTransactionShape,
	matchesTransferCounterpart,
	uniqueTransactionMatches,
} from "./import-reconciliation";

const accountId = "account-a";

describe("matchesTransferCounterpart", () => {
	test("associa entrada importada ao destino da transferência", () => {
		expect(
			matchesTransferCounterpart(
				{ type: "INCOME" },
				{ destinationFinancialAccountId: accountId, originFinancialAccountId: "account-b", type: "TRANSFER" },
				accountId,
			),
		).toBe(true);
	});

	test("associa saída importada à origem da transferência", () => {
		expect(
			matchesTransferCounterpart(
				{ type: "EXPENSE" },
				{ destinationFinancialAccountId: "account-b", originFinancialAccountId: accountId, type: "TRANSFER" },
				accountId,
			),
		).toBe(true);
	});

	test("não associa o lado oposto da transferência", () => {
		expect(
			matchesTransferCounterpart(
				{ type: "INCOME" },
				{ destinationFinancialAccountId: "account-b", originFinancialAccountId: accountId, type: "TRANSFER" },
				accountId,
			),
		).toBe(false);
	});
});

describe("matchesDuplicateTransactionShape", () => {
	test("não associa transferências no sentido oposto", () => {
		expect(
			matchesDuplicateTransactionShape(
				{ destinationFinancialAccountId: "account-b", originFinancialAccountId: accountId, type: "TRANSFER" },
				{ destinationFinancialAccountId: accountId, originFinancialAccountId: "account-b", type: "TRANSFER" },
				accountId,
			),
		).toBe(false);
	});

	test("associa transferências com mesma origem e destino", () => {
		expect(
			matchesDuplicateTransactionShape(
				{ destinationFinancialAccountId: "account-b", originFinancialAccountId: accountId, type: "TRANSFER" },
				{ destinationFinancialAccountId: "account-b", originFinancialAccountId: accountId, type: "TRANSFER" },
				accountId,
			),
		).toBe(true);
	});
});

describe("uniqueTransactionMatches", () => {
	const existing = { id: "existing", source: "TRANSACTION" as const };
	const matches = (
		entries: [string, { candidates: (typeof existing | { id: string; source: "IMPORT_ITEM" })[] } | null][],
		reserved = new Set<string>(),
	) => uniqueTransactionMatches(new Map(entries), reserved);

	test("links one existing candidate without requiring an external identifier", () => {
		expect(matches([["imported", { candidates: [existing] }]])).toEqual([["imported", existing]]);
	});

	test("leaves multiple candidates and competing claims for manual review", () => {
		expect(
			matches([
				["first", { candidates: [existing] }],
				["second", { candidates: [existing] }],
			]),
		).toEqual([]);
		expect(matches([["first", { candidates: [existing, { ...existing, id: "other" }] }]])).toEqual([]);
		expect(
			matches([
				["first", { candidates: [existing] }],
				["second", { candidates: [existing, { ...existing, id: "other" }] }],
			]),
		).toEqual([]);
	});

	test("never links pending items or targets already reserved by pending reconciliation", () => {
		expect(matches([["first", { candidates: [{ id: "pending", source: "IMPORT_ITEM" }] }]])).toEqual([]);
		expect(matches([["first", { candidates: [existing] }]], new Set([existing.id]))).toEqual([]);
		expect(matches([["first", null]])).toEqual([]);
	});
});
