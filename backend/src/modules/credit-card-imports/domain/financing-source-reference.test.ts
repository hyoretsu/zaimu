import { expect, test } from "bun:test";
import {
	getFinancingSource,
	withFinancingSource,
	withoutFinancingSource,
} from "./financing-source-reference";

test("stores the internal source reference without exposing it as the purchase description", () => {
	const id = `credit-card:v1:${"a".repeat(64)}`;
	const stored = withFinancingSource("FIN CINEPOLIS · IOF R$ 0,02", id);
	expect(getFinancingSource(stored)).toBe(id);
	expect(withoutFinancingSource(stored)).toBe("FIN CINEPOLIS · IOF R$ 0,02");
});
