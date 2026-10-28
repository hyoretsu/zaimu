import { expect, test } from "bun:test";
import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import { rememberImportIdentities } from "./import-identities";

test("batch aliases retain their purchase and deduplicate repeated evidence", async () => {
	const calls: unknown[][] = [];
	const query: RawQuery = async <T>(_sql: string, params?: unknown[]) => {
		calls.push(params ?? []);
		return [{ purchaseId: "p" }, { purchaseId: "p" }] as T[];
	};
	await rememberImportIdentities(query, [
		{ externalId: "bank", purchaseId: "p" },
		{ externalId: "tax", purchaseId: "p" },
		{ externalId: "bank", purchaseId: "p" },
	]);
	expect(calls).toEqual([
		[
			["bank", "tax"],
			["p", "p"],
		],
	]);
});

test("conflicting aliases fail before SQL and a database conflict rejects the transaction", async () => {
	let calls = 0;
	const query: RawQuery = async () => {
		calls++;
		return [];
	};
	await expect(
		rememberImportIdentities(query, [
			{ externalId: "bank", purchaseId: "one" },
			{ externalId: "bank", purchaseId: "two" },
		]),
	).rejects.toThrow("já vinculado");
	expect(calls).toBe(0);
	await rememberImportIdentities(query, []);
	expect(calls).toBe(0);
	await expect(
		rememberImportIdentities(query, [{ externalId: "bank", purchaseId: "one" }]),
	).rejects.toThrow("já vinculado");
	expect(calls).toBe(1);
});
