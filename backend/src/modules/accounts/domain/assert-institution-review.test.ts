import { describe, expect, test } from "bun:test";
import { assertInstitutionReview } from "./assert-institution-review";

describe("institution review", () => {
	const pending = { action: "APPROVE", baseVersion: 2, currentVersion: 2, status: "PENDING" };
	test("rejects duplicate publication", () =>
		expect(() => assertInstitutionReview({ ...pending, status: "APPROVED" })).toThrow(
			"Proposta já revisada",
		));
	test("requires reconfirmation after concurrent publication", () =>
		expect(() => assertInstitutionReview({ ...pending, currentVersion: 3 })).toThrow("Versão alterada"));
	test("accepts explicit current version reconfirmation", () =>
		expect(() =>
			assertInstitutionReview({ ...pending, confirmedVersion: 3, currentVersion: 3 }),
		).not.toThrow());
	test("old reconfirmation cannot authorize new version", () =>
		expect(() => assertInstitutionReview({ ...pending, confirmedVersion: 3, currentVersion: 4 })).toThrow(
			"Versão alterada",
		));
	test("requires rejection reason", () =>
		expect(() => assertInstitutionReview({ ...pending, action: "REJECT", reason: " " })).toThrow(
			"Informe o motivo",
		));
});
