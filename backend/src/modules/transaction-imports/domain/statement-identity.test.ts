import { describe, expect, test } from "bun:test";
import { assignStableExternalIds, statementImportId } from "./statement-identity";

const context = { financialAccountId: "account-a", provider: "NUBANK" as const, userId: "user-a" };
const transaction = {
	amount: 13.64,
	date: "2026-08-06",
	description: " Pix   recebido ",
	type: "INCOME" as const,
};

describe("assignStableExternalIds", () => {
	test("normaliza descrição e preserva os IDs ao reimportar", () => {
		expect(assignStableExternalIds([transaction], context)[0].externalId).toBe(
			assignStableExternalIds([{ ...transaction, description: "pix recebido" }], context)[0].externalId,
		);
	});

	test("mantém operações idênticas distintas e IDs nativos", () => {
		const result = assignStableExternalIds(
			[transaction, transaction, { ...transaction, externalId: "native-id" }],
			context,
		);
		expect(result.map(item => item.externalId)).toEqual([
			"nubank:v1:8db6494e655fb93ef3bdbfe53fd4416d0b8b6e9ce801d798cd47f31310c067a7:1",
			"nubank:v1:25d14864c3b1bdd05d293a746a51bc0a1b14e4c45ee254fc56fd01f40fb25b14:2",
			"native-id",
		]);
	});
});

describe("statementImportId", () => {
	test("identifies content independently of filename and transaction ordering", () => {
		expect(statementImportId("u", "a", "NUBANK", ["b", "a"])).toBe(
			statementImportId("u", "a", "NUBANK", ["a", "b"]),
		);
	});
	test("isolates owners, accounts, providers and different contents", () => {
		const id = statementImportId("u", "a", "NUBANK", ["a", "b"]);
		for (const candidate of [
			statementImportId("v", "a", "NUBANK", ["a", "b"]),
			statementImportId("u", "b", "NUBANK", ["a", "b"]),
			statementImportId("u", "a", "INTER", ["a", "b"]),
			statementImportId("u", "a", "NUBANK", ["a"]),
		])
			expect(candidate).not.toBe(id);
		expect(id).toMatch(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
	});
});
