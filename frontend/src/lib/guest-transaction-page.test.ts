import { expect, test } from "bun:test";
import type { Transaction } from "./api";
import { guestTransactionPage } from "./guest-transaction-page";

const row = (id: string, date = "2026-10-01"): Transaction => ({
	amount: 1,
	createdAt: "2026-10-01T00:00:00Z",
	date,
	id,
	type: "EXPENSE",
});
test("guest cursor handles ties and concurrent insertion without repeating rows", () => {
	const first = guestTransactionPage([row("a"), row("b"), row("c")], "guest", { limit: 1 });
	expect(first.items[0]!.id).toBe("c");
	const next = guestTransactionPage([row("a"), row("b"), row("c"), row("new", "2026-10-02")], "guest", {
		cursor: first.nextCursor!,
		limit: 1,
	});
	expect(next.items[0]!.id).toBe("b");
});
test("guest cursor binds owner and Unicode filters", () => {
	const first = guestTransactionPage([row("a"), row("b")], "guest", { limit: 1, search: "🍎" });
	expect(() =>
		guestTransactionPage([row("a")], "other", { cursor: first.nextCursor!, search: "🍎" }),
	).toThrow("Cursor inválido");
	expect(() =>
		guestTransactionPage([row("a")], "guest", { cursor: first.nextCursor!, search: "outra" }),
	).toThrow("Cursor inválido");
	expect(guestTransactionPage([row("a")], "guest", { cursor: first.nextCursor!, search: "🍎" }).hasMore).toBe(
		false,
	);
});
