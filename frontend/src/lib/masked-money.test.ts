import { expect, test } from "bun:test";
import { parseMaskedMoney } from "./masked-money";

test("masked form values preserve ISO zero and three decimal currencies", () => {
	expect(parseMaskedMoney("JP¥ 1.500")).toBe(1500);
	expect(parseMaskedMoney("KWD 1,001")).toBe(1.001);
	expect(parseMaskedMoney("US$ 1.234,56")).toBe(1234.56);
	expect(parseMaskedMoney("-R$ 10,00")).toBe(-10);
	expect(Number.isNaN(parseMaskedMoney(""))).toBe(true);
});
