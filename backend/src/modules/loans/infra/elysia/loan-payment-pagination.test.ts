import { describe, expect, test } from "bun:test";
import { encodePaginationCursor } from "~/shared/application/pagination-cursor";
import { decodePaymentCursor, paymentFilterHash, paymentPage } from "./loan-payment-pagination";

describe("loan payment pagination", () => {
	test("ties continue by ID and final page has no cursor", () => {
		const filterHash = paymentFilterHash("owner", "loan");
		const rows = [
			{ id: "a", installmentNumber: 1 },
			{ id: "b", installmentNumber: 1 },
			{ id: "c", installmentNumber: 2 },
		];
		const first = paymentPage(rows, 1, filterHash);
		expect(first.items).toEqual([rows[0]]);
		expect(first.hasMore).toBe(true);
		expect(decodePaymentCursor(first.nextCursor!, filterHash)).toEqual(rows[0]);
		const final = paymentPage(rows.slice(1), 2, filterHash);
		expect(final.items).toEqual(rows.slice(1));
		expect(final.hasMore).toBe(false);
		expect(final.nextCursor).toBeNull();
		expect(paymentPage([], 50, filterHash)).toEqual({ hasMore: false, items: [], nextCursor: null });
	});

	test("cursors cannot cross users or loans", () => {
		const hash = paymentFilterHash("owner", "loan");
		const cursor = paymentPage(
			[
				{ id: "a", installmentNumber: 1 },
				{ id: "b", installmentNumber: 2 },
			],
			1,
			hash,
		).nextCursor!;
		for (const otherHash of [paymentFilterHash("peer", "loan"), paymentFilterHash("owner", "other")]) {
			expect(() => decodePaymentCursor(cursor, otherHash)).toThrow("Cursor inválido");
		}
	});

	test("rejects malformed cursor and invalid installment positions", () => {
		const filterHash = paymentFilterHash("owner", "loan");
		expect(() => decodePaymentCursor("broken", filterHash)).toThrow("Cursor inválido");
		for (const installmentNumber of [0, -1, 1.5, "1"]) {
			const cursor = encodePaginationCursor({ filterHash, value: { id: "a", installmentNumber } });
			expect(() => decodePaymentCursor(cursor, filterHash)).toThrow("Cursor inválido");
		}
	});
});
