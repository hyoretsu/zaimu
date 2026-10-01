import { expect, test } from "bun:test";
import { categoryLookupIds } from "./category-lookup";

test("canonicalizes lookup IDs and bounds batch size", () => {
	expect(categoryLookupIds("b,a,b")).toEqual(["a", "b"]);
	expect(categoryLookupIds("")).toEqual([]);
	for (const invalid of [
		"a,,b",
		"a".repeat(37),
		Array.from({ length: 1001 }, (_, id) => String(id)).join(","),
	]) {
		expect(() => categoryLookupIds(invalid)).toThrow("IDs de categorias inválidos");
	}
});
