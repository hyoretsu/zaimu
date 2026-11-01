import { expect, test } from "bun:test";
import { findStatementCard } from "./statement-modal-context";
for (const size of [1, 10, 10000])
	test(`statement owner resolves with one lookup for ${size} cards`, async () => {
		const cards = Array.from({ length: size }, (_, i) => `card-${i}`);
		const calls: string[] = [];
		expect(
			await findStatementCard(cards, "invoice", async id => {
				calls.push(id);
				return cards.at(-1)!;
			}),
		).toBe(cards.at(-1)!);
		expect(calls).toEqual(["invoice"]);
	});
test("missing or unavailable card never opens unrelated card", async () => {
	expect(await findStatementCard(["visible"], "invoice", async () => null)).toBeNull();
	expect(await findStatementCard(["visible"], "invoice", async () => "hidden")).toBeNull();
});
test("ownership failure remains retryable error", async () => {
	await expect(
		findStatementCard(["card"], "invoice", async () => {
			throw new Error("unavailable");
		}),
	).rejects.toThrow("unavailable");
});
