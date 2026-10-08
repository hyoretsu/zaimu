import { describe, expect, test } from "bun:test";
import { assertRewardsAccountDetails } from "./assert-rewards-account-details";

describe("assertRewardsAccountDetails", () => {
	test("accepts points without conversion", () => {
		expect(() => assertRewardsAccountDetails({ initialBalance: 1000, kind: "POINTS" })).not.toThrow();
	});

	test("accepts a complete points conversion", () => {
		expect(() =>
			assertRewardsAccountDetails({
				conversionAmount: 10,
				conversionPoints: 1000,
				initialBalance: 0,
				kind: "POINTS",
			}),
		).not.toThrow();
	});

	test("rejects incomplete conversion", () => {
		expect(() =>
			assertRewardsAccountDetails({ conversionPoints: 1000, initialBalance: 0, kind: "POINTS" }),
		).toThrow("Informe os pontos e o valor da conversão juntos");
	});
});

test("points equivalent uses declared ISO denomination precision", () => {
	const details = { conversionAmount: 1.001, conversionPoints: 1000, initialBalance: 0, kind: "POINTS" };
	expect(() => assertRewardsAccountDetails(details, "KWD")).not.toThrow();
	expect(() => assertRewardsAccountDetails(details, "JPY")).toThrow();
});
