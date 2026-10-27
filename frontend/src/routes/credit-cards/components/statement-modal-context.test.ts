import { expect, test } from "bun:test";
import { findStatementCard } from "./statement-modal-context";

test("statement-only links resolve the owning card without choosing the first card", async () => {
	const loaded: string[] = [];
	const card = await findStatementCard(["first", "second", "third"], "invoice", async id => {
		loaded.push(id);
		return id === "second" ? [{ id: "invoice" }] : [{ id: "other" }];
	});
	expect(card).toBe("second");
	expect(loaded).toEqual(["first", "second"]);
});
test("missing statement never opens an unrelated card", async () => {
	expect(await findStatementCard(["first", "second"], "missing", async () => [{ id: "other" }])).toBeNull();
});
test("failed ownership lookup remains an error instead of becoming not found", async () => {
	await expect(
		findStatementCard(["first"], "invoice", async () => {
			throw new Error("unavailable");
		}),
	).rejects.toThrow("unavailable");
});
