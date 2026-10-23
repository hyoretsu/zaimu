import { expect, test } from "bun:test";
import { statementLabel } from "./statement-label";

test("only duplicate months on the same card add the due day", () => {
	const first = { creditCardId: "card", dueDate: "2024-10-08", id: "first" };
	const second = { creditCardId: "card", dueDate: "2024-10-24", id: "second" };
	expect(statementLabel(first, [first])).not.toContain("vence");
	expect(statementLabel(first, [first, second])).toContain("vence 08/10");
	expect(statementLabel(second, [first, second])).toContain("vence 24/10");
	expect(statementLabel(first, [first, { ...second, creditCardId: "other" }])).not.toContain("vence");
});
