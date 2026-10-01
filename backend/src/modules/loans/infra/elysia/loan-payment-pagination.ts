import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";

interface PaymentCursor {
	id: string;
	installmentNumber: number;
}

const isPaymentCursor = (value: unknown): value is PaymentCursor => {
	if (!value || typeof value !== "object") return false;
	const cursor = value as Record<string, unknown>;
	return (
		typeof cursor.id === "string" &&
		cursor.id.length > 0 &&
		typeof cursor.installmentNumber === "number" &&
		Number.isSafeInteger(cursor.installmentNumber) &&
		cursor.installmentNumber > 0
	);
};

export const paymentFilterHash = (userId: string, loanId: string) =>
	paginationFilterHash(userId, { domain: "loan-payments", loanId });

export const decodePaymentCursor = (cursor: string | undefined, filterHash: string) =>
	decodePaginationCursor(cursor, filterHash, isPaymentCursor);

export function paymentPage<Item extends PaymentCursor>(rows: Item[], limit: number, filterHash: string) {
	const hasMore = rows.length > limit;
	const items = rows.slice(0, limit);
	const last = items.at(-1);
	return {
		hasMore,
		items,
		nextCursor:
			hasMore && last
				? encodePaginationCursor({
						filterHash,
						value: { id: last.id, installmentNumber: last.installmentNumber },
					})
				: null,
	};
}
