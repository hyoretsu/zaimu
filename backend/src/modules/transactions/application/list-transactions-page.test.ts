import { describe, expect, test } from "bun:test";
import { HttpException } from "~/shared/errors";
import {
	decodeTransactionCursor,
	encodeTransactionCursor,
	transactionPageFilterHash,
} from "./list-transactions-page";

describe("transaction page cursor", () => {
	test("round-trips stable ordering fields", () => {
		const filterHash = transactionPageFilterHash({ search: "mercado", type: "EXPENSE" });
		const payload = {
			createdAt: "2026-09-22 10:00:00.000",
			date: "2026-09-22",
			filterHash,
			id: "transaction-id",
			sourceRank: 0,
		};
		expect(decodeTransactionCursor(encodeTransactionCursor(payload), filterHash)).toEqual(payload);
	});

	test("rejects malformed cursors", () => {
		expect(() => decodeTransactionCursor("invalid", "hash")).toThrow(HttpException);
	});

	test("rejects a cursor reused with different filters", () => {
		const firstHash = transactionPageFilterHash({ type: "EXPENSE" });
		const cursor = encodeTransactionCursor({
			createdAt: "2026-09-22 10:00:00.000",
			date: "2026-09-22",
			filterHash: firstHash,
			id: "transaction-id",
			sourceRank: 1,
		});
		expect(() => decodeTransactionCursor(cursor, transactionPageFilterHash({ type: "INCOME" }))).toThrow(
			HttpException,
		);
	});
});
