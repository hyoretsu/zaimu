import { expect, test } from "bun:test";
import { indexDuplicateCandidates } from "./duplicate-candidate-index";

test("candidate lookup preserves exact date/amount semantics and source order across history sizes", () => {
	for (const size of [10, 10000, 100000]) {
		const history = Array.from({ length: size }, (_, id) => ({
			amount: String(id + 10),
			date: "2020-01-01",
			externalIds: [`external-${id}`],
			id,
		}));
		const target = {
			amount: "12.34",
			date: "2026-10-04T12:00:00Z",
			externalIds: ["target", "target"],
			id: size,
		};
		const second = { ...target, externalIds: ["target"], id: size + 1 };
		const index = indexDuplicateCandidates([...history, target, second]);
		expect(index.dated({ amount: 12.34, date: "2026-10-04" })).toEqual([target, second]);
		expect(index.external("target")).toEqual([target, second]);
		expect(index.external("missing")).toEqual([]);
		expect(index.dated({ amount: 12.34, date: "2026-10-05" })).toEqual([]);
	}
});
