import { describe, expect, test } from "bun:test";
import {
	type CreditCardStatementLayout,
	selectCreditCardStatementLayout,
} from "./credit-card-statement-layout";

const parse: CreditCardStatementLayout["parse"] = () => {
	throw new Error("Selection must not execute parsers");
};
const layouts: CreditCardStatementLayout[] = [
	{ id: "old", matches: text => text.includes("old"), parse, provider: "BRADESCO" },
	{ id: "new", matches: text => text.includes("new"), parse, provider: "BRADESCO" },
	{ id: "other", matches: () => true, parse, provider: "INTER" },
];

describe("selectCreditCardStatementLayout", () => {
	test("selects different layouts within one institution without executing parsers", () => {
		expect(selectCreditCardStatementLayout("old", "BRADESCO", layouts).id).toBe("old");
		expect(selectCreditCardStatementLayout("new", "BRADESCO", layouts).id).toBe("new");
	});

	test("limits matching to the selected institution", () => {
		expect(selectCreditCardStatementLayout("old new", "INTER", layouts).id).toBe("other");
	});

	test("rejects unknown layouts instead of trying an arbitrary parser", () => {
		expect(() => selectCreditCardStatementLayout("unknown", "BRADESCO", layouts)).toThrow(
			"Layout de fatura não reconhecido",
		);
	});

	test("rejects ambiguity regardless of registration order", () => {
		for (const candidates of [layouts, [...layouts].reverse()])
			expect(() => selectCreditCardStatementLayout("old new", "BRADESCO", candidates)).toThrow(
				"um único layout",
			);
	});

	test("distinguishes unsupported institutions from unrecognized layouts", () => {
		expect(() => selectCreditCardStatementLayout("old", "NUBANK", layouts)).toThrow(
			"Instituição de cartão não suportada",
		);
	});
});
