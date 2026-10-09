import { expect, test } from "bun:test";
import { pdfFixture } from "./pdf-fixture";

test("PDF fixture has deterministic offsets and escaped text across pages", () => {
	const lines = Array.from({ length: 80 }, (_, i) => `Performance (${i})`);
	const data = pdfFixture(lines);
	expect(data).toEqual(pdfFixture(lines));
	const text = new TextDecoder("windows-1252").decode(data);
	expect(text).toContain("/Count 3");
	expect(text).toContain("Performance \\(0\\)");
	const offset = Number(text.match(/startxref\n(\d+)/)?.[1]);
	expect(text.slice(offset, offset + 4)).toBe("xref");
});
