import { expect, test } from "bun:test";
import {
	getFinancingSource,
	getFinancingTarget,
	preserveFinancedOperation,
	withFinancingSource,
	withFinancingTarget,
	withoutFinancingReferences,
	withoutFinancingSource,
} from "./financing-source-reference";

test("stores the internal source reference without exposing it as the purchase description", () => {
	const id = `credit-card:v1:${"a".repeat(64)}`;
	const stored = withFinancingSource("FIN CINEPOLIS · IOF R$ 0,02", id);
	expect(getFinancingSource(stored)).toBe(id);
	expect(withoutFinancingSource(stored)).toBe("FIN CINEPOLIS · IOF R$ 0,02");
});

test("stores the reciprocal target reference without exposing it", () => {
	const id = `credit-card:v1:${"b".repeat(64)}`;
	const stored = withFinancingTarget("CINEPOLIS OPERADORA DE", id);
	expect(getFinancingTarget(stored)).toBe(id);
	expect(withoutFinancingReferences(stored)).toBe("CINEPOLIS OPERADORA DE");
});

test("preserves FIN and IOF when the imported merchant is edited", () => {
	expect(preserveFinancedOperation("FIN CINEPOLIS · IOF R$ 0,24", "Cinépolis Recife")).toBe(
		"FIN Cinépolis Recife · IOF R$ 0,24",
	);
});
